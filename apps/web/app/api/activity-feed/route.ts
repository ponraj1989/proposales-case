import { NextResponse } from 'next/server';
import { getUserRole } from '@/lib/auth';
import { listActivityFeed, pushActivityFeedEvent } from '@/lib/activity-feed';
import { getSDK } from '@/lib/sdk';

let seeded = false;

/** Seed activity feed from existing proposal tracking data if the feed is empty */
async function seedFromProposals() {
  if (seeded) return;
  seeded = true;

  const existing = await listActivityFeed(1);
  if (existing.length > 0) return;

  try {
    const sdk = getSDK();
    const searchResult = await sdk.proposals.search(undefined, 30);
    const items = Array.isArray(searchResult.data) ? searchResult.data : searchResult.data ? [searchResult.data] : [];

    for (const item of items) {
      const uuid = (item as { uuid?: string }).uuid;
      if (!uuid) continue;

      try {
        const full = await sdk.proposals.get(uuid);
        const p = full.data;
        const title = p.title_md || p.title || 'Untitled';
        const contact = p.contact_name || p.recipient_name || 'Customer';
        const totalCents = p.value_with_tax ?? 0;
        const amount = totalCents > 0 ? totalCents / 100 : undefined;
        const currency = p.currency || 'EUR';
        const tracking = p.tracking;

        // Push "created" event
        const createdAt = (item as unknown as Record<string, unknown>).created_at;
        if (createdAt) {
          await pushActivityFeedEvent({
            type: 'created',
            title: 'Proposal Created',
            description: `"${title}" created for ${contact}${amount ? ` — €${amount.toLocaleString('en-IE', { minimumFractionDigits: 2 })}` : ''}`,
            proposalUuid: uuid,
            proposalTitle: title,
            recipientName: contact,
            amount,
            currency,
            time: new Date((createdAt as number) * 1000).toISOString(),
          });
        }

        // Push "sent" if tracked
        if (tracking?.sent_at) {
          await pushActivityFeedEvent({
            type: 'sent',
            title: 'Proposal Sent',
            description: `"${title}" sent to ${contact}`,
            proposalUuid: uuid,
            proposalTitle: title,
            recipientName: contact,
            amount,
            currency,
            time: new Date(tracking.sent_at).toISOString(),
          });
        }

        // Push "viewed" if tracked
        if (tracking?.first_viewed_at) {
          await pushActivityFeedEvent({
            type: 'viewed',
            title: 'Proposal Viewed',
            description: `${contact} viewed "${title}"${tracking.number_of_views ? ` (${tracking.number_of_views} views)` : ''}`,
            proposalUuid: uuid,
            proposalTitle: title,
            recipientName: contact,
            amount,
            currency,
            time: new Date(tracking.first_viewed_at).toISOString(),
          });
        }

        // Push "signed" if accepted
        if (tracking?.accepted_at) {
          await pushActivityFeedEvent({
            type: 'signed',
            title: 'E-Sign Completed',
            description: `${contact} e-signed "${title}"${amount ? ` — €${amount.toLocaleString('en-IE', { minimumFractionDigits: 2 })}` : ''}`,
            proposalUuid: uuid,
            proposalTitle: title,
            recipientName: contact,
            amount,
            currency,
            time: new Date(tracking.accepted_at).toISOString(),
          });
        }

        // Push "expired" if status is expired
        if (p.status === 'expired' && tracking?.expired_at) {
          await pushActivityFeedEvent({
            type: 'expired',
            title: 'Proposal Expired',
            description: `"${title}" expired`,
            proposalUuid: uuid,
            proposalTitle: title,
            time: new Date(tracking.expired_at).toISOString(),
          });
        }
      } catch {
        // Skip proposals we can't fetch
      }
    }
  } catch {
    // Non-critical — don't break the feed if seeding fails
  }
}

export async function GET() {
  const role = await getUserRole();
  if (!role) {
    return NextResponse.json({ error: { message: 'Authentication required' } }, { status: 401 });
  }

  await seedFromProposals();

  const events = await listActivityFeed(50);
  return NextResponse.json({ data: events });
}
