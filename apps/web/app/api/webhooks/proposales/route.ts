import { NextResponse } from 'next/server';
import { bookSpace } from '@proposales/ai';
import { getSDK } from '@/lib/sdk';
import { pushActivityFeedEvent } from '@/lib/activity-feed';
import connectDB from '@/lib/mongodb';
import { UserProposal } from '@/lib/models';

/**
 * POST /api/webhooks/proposales — Handle Proposales status updates
 *
 * When a proposal is accepted (e-signed), automatically book the venue
 * space in the Mock PMS so it becomes unavailable for others.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event, uuid, status } = body;
    const normalizedEvent = typeof event === 'string' ? event : '';

    const actor = body.name || body.contact_name || body.recipient_name || 'Customer';

    // Fetch actual proposal data for rich activity feed entries
    let proposalTitle: string | undefined;
    let recipientName: string | undefined;
    let amount: number | undefined;
    let currency: string | undefined;

    if (uuid) {
      try {
        const sdk = getSDK();
        const result = await sdk.proposals.get(uuid);
        const proposal = result.data;
        if (proposal) {
          proposalTitle = proposal.title_md || proposal.title || undefined;
          recipientName = proposal.recipient_name || proposal.contact_name || actor;
          const totalCents = proposal.value_with_tax ?? proposal.value_without_tax ?? 0;
          if (totalCents > 0) {
            amount = totalCents / 100;
            currency = proposal.currency || 'USD';
          }
        }
      } catch {
        // API fetch failed — continue with basic data
      }
    }

    const fmtAmount = amount
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount)
      : '';
    const displayName = recipientName || actor;
    const displayTitle = proposalTitle ? `"${proposalTitle}"` : `proposal ${uuid?.slice(0, 8) ?? ''}`;

    if (normalizedEvent === 'proposal.viewed' && uuid) {
      await pushActivityFeedEvent({
        type: 'viewed',
        title: 'Proposal Viewed',
        description: `${displayName} viewed ${displayTitle}${fmtAmount ? ` (${fmtAmount})` : ''}`,
        proposalUuid: uuid,
        proposalTitle,
        recipientName: displayName,
        amount,
        currency,
      });
    }

    if ((normalizedEvent === 'proposal.sent' || (normalizedEvent === 'proposal.status_changed' && status === 'active')) && uuid) {
      await pushActivityFeedEvent({
        type: 'sent',
        title: 'Proposal Sent',
        description: `${displayTitle} sent to ${displayName}${fmtAmount ? ` (${fmtAmount})` : ''}`,
        proposalUuid: uuid,
        proposalTitle,
        recipientName: displayName,
        amount,
        currency,
      });
    }

    if ((normalizedEvent === 'proposal.signed' || (normalizedEvent === 'proposal.status_changed' && status === 'accepted')) && uuid) {
      await pushActivityFeedEvent({
        type: 'signed',
        title: 'E-Sign Completed',
        description: `${displayName} e-signed ${displayTitle}${fmtAmount ? ` — ${fmtAmount}` : ''}`,
        proposalUuid: uuid,
        proposalTitle,
        recipientName: displayName,
        amount,
        currency,
      });
    }

    if (normalizedEvent === 'proposal.status_changed' && uuid) {
      if (status === 'accepted') {
        // handled above for unified support with proposal.signed
      } else if (status === 'active') {
        // handled above for unified support with proposal.sent
      } else if (status === 'expired') {
        await pushActivityFeedEvent({
          type: 'expired',
          title: 'Proposal Expired',
          description: `${displayTitle} expired${fmtAmount ? ` — ${fmtAmount} lost` : ''}`,
          proposalUuid: uuid,
          proposalTitle,
          recipientName: displayName,
          amount,
          currency,
        });
      } else {
        await pushActivityFeedEvent({
          type: 'updated',
          title: 'Proposal Updated',
          description: `${displayTitle} changed to ${status || 'updated'}`,
          proposalUuid: uuid,
          proposalTitle,
          recipientName: displayName,
          amount,
          currency,
        });
      }
    }

    // Log webhook for debugging
    console.log(`[Webhook] Proposales event=${event} uuid=${uuid} status=${status}`);

    // ─── Update UserProposal status in MongoDB ───
    if (uuid) {
      try {
        await connectDB();
        let newStatus: string | null = null;
        if (normalizedEvent === 'proposal.viewed') newStatus = 'viewed';
        if (normalizedEvent === 'proposal.sent' || (normalizedEvent === 'proposal.status_changed' && status === 'active')) newStatus = 'sent';
        if (normalizedEvent === 'proposal.signed' || (normalizedEvent === 'proposal.status_changed' && status === 'accepted')) newStatus = 'signed';
        if (normalizedEvent === 'proposal.status_changed' && status === 'expired') newStatus = 'expired';
        if (normalizedEvent === 'proposal.status_changed' && status === 'rejected') newStatus = 'rejected';

        if (newStatus) {
          const updateFields: Record<string, unknown> = { status: newStatus };
          // Also update proposalUrl if available from fetched proposal
          if (proposalTitle) updateFields.proposalTitle = proposalTitle;
          if (amount) updateFields.totalAmountCents = Math.round(amount * 100);
          if (currency) updateFields.currency = currency;

          await UserProposal.findOneAndUpdate(
            { proposalUuid: uuid },
            { $set: updateFields },
          );
        }
      } catch (err) {
        console.error('[Webhook] Failed to update UserProposal:', err instanceof Error ? err.message : String(err));
      }
    }

    if ((normalizedEvent === 'proposal.signed' || (normalizedEvent === 'proposal.status_changed' && status === 'accepted')) && uuid) {
      // Fetch the proposal to get booking details from its data field
      const sdk = getSDK();
      const result = await sdk.proposals.get(uuid);
      const proposal = result.data;

      if (proposal) {
        const data = proposal.data || {};
        const spaceId = data.space_id as string | undefined;
        const date = data.event_date as string | undefined;
        const timeSlotId = data.time_slot_id as string | undefined;
        const guests = data.guests as number | undefined;
        const contactEmail = proposal.recipient_email || proposal.contact_email || '';
        const contactName = proposal.recipient_name || proposal.contact_name || '';

        if (spaceId && date && timeSlotId && guests) {
          const bookingResult = bookSpace({
            space_id: spaceId,
            date,
            time_slot_id: timeSlotId,
            event_type: (data.event_type as string) || 'event',
            guests,
            contact_email: contactEmail,
            contact_name: contactName,
            proposal_uuid: uuid,
          });

          console.log(`[Webhook] Auto-booked space: ${JSON.stringify(bookingResult)}`);

          if (bookingResult.success) {
            await pushActivityFeedEvent({
              type: 'created',
              title: 'Inventory Reserved',
              description: `Space booked for ${displayTitle}${recipientName ? ` — ${recipientName}` : ''}${fmtAmount ? ` (${fmtAmount})` : ''}`,
              proposalUuid: uuid,
              proposalTitle,
              recipientName: displayName,
              amount,
              currency,
            });
          }

          return NextResponse.json({
            received: true,
            action: 'auto_booked',
            booking: bookingResult,
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[Webhook] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ received: true, error: 'Processing failed' }, { status: 200 });
  }
}
