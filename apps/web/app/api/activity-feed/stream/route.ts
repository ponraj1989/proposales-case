import { NextResponse } from 'next/server';
import { getUserRole } from '@/lib/auth';
import { ACTIVITY_FEED_CHANNEL } from '@/lib/activity-feed';
import { getRedis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const role = await getUserRole();
  if (!role) {
    return NextResponse.json({ error: { message: 'Authentication required' } }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: { message: 'Redis not configured' } }, { status: 503 });
  }

  const subscriber = redis.duplicate();
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const cleanup = async () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        try {
          await subscriber.unsubscribe(ACTIVITY_FEED_CHANNEL);
        } catch {
          // ignore cleanup errors
        }
        subscriber.removeAllListeners('message');
        try {
          subscriber.disconnect();
        } catch {
          // ignore cleanup errors
        }
      };

      request.signal.addEventListener(
        'abort',
        () => {
          void cleanup();
          controller.close();
        },
        { once: true },
      );

      try {
        await subscriber.connect();
        await subscriber.subscribe(ACTIVITY_FEED_CHANNEL);

        subscriber.on('message', (channel, message) => {
          if (channel !== ACTIVITY_FEED_CHANNEL) return;
          sendEvent('activity', JSON.parse(message));
        });

        sendEvent('ready', { connected: true });

        heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        }, 15000);
      } catch {
        sendEvent('error', { message: 'Unable to start activity stream' });
        await cleanup();
        controller.close();
      }
    },
    async cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      try {
        await subscriber.unsubscribe(ACTIVITY_FEED_CHANNEL);
      } catch {
        // ignore cleanup errors
      }
      subscriber.removeAllListeners('message');
      try {
        subscriber.disconnect();
      } catch {
        // ignore cleanup errors
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
