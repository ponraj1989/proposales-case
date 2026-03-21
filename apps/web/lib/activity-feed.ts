import { getRedis } from './redis';

export interface ActivityFeedEvent {
  id: string;
  type: 'viewed' | 'signed' | 'commented' | 'created' | 'sent' | 'expired' | 'updated';
  title: string;
  description: string;
  time: string;
  proposalUuid?: string;
}

const ACTIVITY_FEED_KEY = 'activity:feed';
const ACTIVITY_FEED_MAX = 200;

export async function listActivityFeed(limit = 40): Promise<ActivityFeedEvent[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const rows = await redis.lrange(ACTIVITY_FEED_KEY, 0, Math.max(0, limit - 1));
    return rows
      .map((row) => {
        try {
          return JSON.parse(row) as ActivityFeedEvent;
        } catch {
          return null;
        }
      })
      .filter((event): event is ActivityFeedEvent => !!event)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  } catch {
    return [];
  }
}

export async function pushActivityFeedEvent(
  event: Omit<ActivityFeedEvent, 'id' | 'time'> & { id?: string; time?: string },
) {
  const redis = getRedis();
  if (!redis) return;

  const payload: ActivityFeedEvent = {
    id: event.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: event.time || new Date().toISOString(),
    type: event.type,
    title: event.title,
    description: event.description,
    proposalUuid: event.proposalUuid,
  };

  try {
    await redis.lpush(ACTIVITY_FEED_KEY, JSON.stringify(payload));
    await redis.ltrim(ACTIVITY_FEED_KEY, 0, ACTIVITY_FEED_MAX - 1);
  } catch {
    return;
  }
}
