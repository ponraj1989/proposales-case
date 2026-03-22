import { NextResponse } from 'next/server';
import { getUserRole } from '@/lib/auth';
import { listActivityFeed, pushActivityFeedEvent, ACTIVITY_FEED_SEEN_KEY } from '@/lib/activity-feed';
import { getRedis } from '@/lib/redis';
import { getSDK } from '@/lib/sdk';

// Dedup key: Redis SET that tracks which proposal events have already been pushed
const SEEN_KEY = ACTIVITY_FEED_SEEN_KEY;
const REFRESH_INTERVAL_MS = 60_000; // re-sync from API at most once per minute
let lastRefreshedAt = 0;
let refreshInFlight: Promise<void> | null = null;

/** Push an event only if it hasn't been pushed before (dedup by uuid+type) */
async function pushIfNew(
  redis: ReturnType<typeof getRedis>,
  dedupKey: string,
  event: Parameters<typeof pushActivityFeedEvent>[0],
) {
  if (!redis) return;
  const alreadySeen = await redis.sismember(SEEN_KEY, dedupKey);
  if (alreadySeen) return;
  await pushActivityFeedEvent(event);
  await redis.sadd(SEEN_KEY, dedupKey);
}

/** Periodically sync the activity feed from the Proposales API (deduped) */
async function refreshFromProposals() {
  const now = Date.now();
  if (now - lastRefreshedAt < REFRESH_INTERVAL_MS) return;
  lastRefreshedAt = now;

  const redis = getRedis();
  if (!redis) return;

  try {
    const sdk = getSDK();
    const items = (await sdk.proposals.searchAll())
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 30);

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
        const statusChangedAt = p.status_changed_at ? new Date(p.status_changed_at * 1000).toISOString() : undefined;

        // "created" event
        const createdAt = (item as unknown as Record<string, unknown>).created_at;
        if (createdAt) {
          await pushIfNew(redis, `${uuid}:created`, {
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

        // "sent" event
        if (tracking?.sent_at) {
          await pushIfNew(redis, `${uuid}:sent`, {
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

        // "viewed" event
        if (tracking?.first_viewed_at) {
          await pushIfNew(redis, `${uuid}:viewed`, {
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

        // "signed" event
        if (tracking?.accepted_at) {
          await pushIfNew(redis, `${uuid}:signed`, {
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

        if (tracking?.rejected_at || p.status === 'rejected') {
          await pushIfNew(redis, `${uuid}:rejected`, {
            type: 'rejected',
            title: 'Proposal Rejected',
            description: `${contact} rejected "${title}"${amount ? ` — €${amount.toLocaleString('en-IE', { minimumFractionDigits: 2 })}` : ''}`,
            proposalUuid: uuid,
            proposalTitle: title,
            recipientName: contact,
            amount,
            currency,
            time: tracking?.rejected_at
              ? new Date(tracking.rejected_at).toISOString()
              : (statusChangedAt || new Date((item.updated_at as number) * 1000).toISOString()),
          });
        }

        // "expired" event
        if (p.status === 'expired' && tracking?.expired_at) {
          await pushIfNew(redis, `${uuid}:expired`, {
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
    // Non-critical — don't break the feed if refresh fails
  }
}

function scheduleRefreshFromProposals() {
  if (refreshInFlight) return;
  refreshInFlight = refreshFromProposals().finally(() => {
    refreshInFlight = null;
  });
}

export async function GET() {
  const role = await getUserRole();
  if (!role) {
    return NextResponse.json({ error: { message: 'Authentication required' } }, { status: 401 });
  }

  // Keep endpoint fast: return cached feed immediately and refresh in background.
  scheduleRefreshFromProposals();

  const events = await listActivityFeed(50);
  return NextResponse.json({ data: events });
}
