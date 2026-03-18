import { getRedis } from './redis';
import { createLogger } from './logger';

const log = createLogger('rate-limiter');
const WINDOW_SEC = 60;
const MAX_REQUESTS = 60;

export async function checkRateLimit(
  identifier: string,
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const redis = getRedis();

  if (!redis) {
    log.debug('No Redis — rate limiting disabled');
    return { success: true, limit: MAX_REQUESTS, remaining: MAX_REQUESTS, reset: 0 };
  }

  const key = `ratelimit:${identifier}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - WINDOW_SEC;

  try {
    const pipeline = redis.pipeline();
    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart);
    // Add current request
    pipeline.zadd(key, now, `${now}:${Math.random()}`);
    // Count requests in window
    pipeline.zcard(key);
    // Set key expiry
    pipeline.expire(key, WINDOW_SEC);

    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number) ?? 0;
    const remaining = Math.max(0, MAX_REQUESTS - count);
    const reset = now + WINDOW_SEC;

    if (count > MAX_REQUESTS) {
      return { success: false, limit: MAX_REQUESTS, remaining: 0, reset };
    }

    return { success: true, limit: MAX_REQUESTS, remaining, reset };
  } catch (err) {
    log.error('Rate limit check failed', { identifier, error: err instanceof Error ? err.message : String(err) });
    return { success: true, limit: MAX_REQUESTS, remaining: MAX_REQUESTS, reset: 0 };
  }
}
