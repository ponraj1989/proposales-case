import { NextResponse } from 'next/server';
import { bookSpace } from '@proposales/ai';
import { getSDK } from '@/lib/sdk';
import { pushActivityFeedEvent } from '@/lib/activity-feed';

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

    const actor = body.name || body.contact_name || body.recipient_name || 'Customer';

    if (event === 'proposal.viewed' && uuid) {
      await pushActivityFeedEvent({
        type: 'viewed',
        title: 'Proposal Viewed',
        description: `Proposal viewed by ${actor}`,
        proposalUuid: uuid,
      });
    }

    if (event === 'proposal.status_changed' && uuid) {
      if (status === 'accepted') {
        await pushActivityFeedEvent({
          type: 'signed',
          title: 'E-Sign Completed',
          description: `${actor} completed e-sign`,
          proposalUuid: uuid,
        });
      } else if (status === 'active') {
        await pushActivityFeedEvent({
          type: 'sent',
          title: 'Proposal Sent',
          description: `Proposal sent to ${actor}`,
          proposalUuid: uuid,
        });
      } else if (status === 'expired') {
        await pushActivityFeedEvent({
          type: 'expired',
          title: 'Proposal Expired',
          description: `Proposal ${uuid.slice(0, 8)} expired`,
          proposalUuid: uuid,
        });
      } else {
        await pushActivityFeedEvent({
          type: 'updated',
          title: 'Proposal Updated',
          description: `Proposal ${uuid.slice(0, 8)} changed to ${status || 'updated'}`,
          proposalUuid: uuid,
        });
      }
    }

    // Log webhook for debugging
    console.log(`[Webhook] Proposales event=${event} uuid=${uuid} status=${status}`);

    if (event === 'proposal.status_changed' && status === 'accepted' && uuid) {
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
              description: `Inventory reserved for proposal ${uuid.slice(0, 8)}`,
              proposalUuid: uuid,
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
