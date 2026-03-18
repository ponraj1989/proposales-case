import Redis from 'ioredis';
import { createLogger } from './logger';

const log = createLogger('redis');

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url || !url.startsWith('redis://')) {
    log.warn('Redis not configured — REDIS_URL missing or invalid');
    return null;
  }

  client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  client.on('error', (err) => {
    log.error('Connection error', { error: err.message });
  });

  client.on('connect', () => {
    log.info('Connected to Redis');
  });

  return client;
}
