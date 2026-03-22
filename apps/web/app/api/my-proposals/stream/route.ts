import { NextResponse } from 'next/server';
import { getSession, getUserEmail } from '@/lib/auth';
import { getRedis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const MY_PROPOSALS_CHANNEL_PREFIX = 'proposals:feed:';

/**
 * GET /api/my-proposals/stream
 * SSE stream for guest users — pushes proposal status updates in real-time
 * via a per-user Redis pub/sub channel keyed by email.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { message: 'Authentication required' } }, { status: 401 });
  }

  const email = await getUserEmail();
  if (!email) {
    return NextResponse.json({ error: { message: 'User email not found' } }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: { message: 'Redis not configured' } }, { status: 503 });
  }

  const channel = `${MY_PROPOSALS_CHANNEL_PREFIX}${email.toLowerCase()}`;
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
          await subscriber.unsubscribe(channel);
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
        await subscriber.subscribe(channel);

        subscriber.on('message', (ch, message) => {
          if (ch !== channel) return;
          try {
            sendEvent('proposal-update', JSON.parse(message));
          } catch {
            // ignore malformed messages
          }
        });

        sendEvent('ready', { connected: true });

        heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        }, 15000);
      } catch {
        sendEvent('error', { message: 'Unable to start proposals stream' });
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
        await subscriber.unsubscribe(channel);
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
