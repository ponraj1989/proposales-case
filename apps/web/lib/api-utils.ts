import { NextResponse } from 'next/server';
import { checkRateLimit } from './rate-limiter';
import { getSession } from './auth';
import { createLogger } from './logger';

const log = createLogger('api-utils');

export async function withAuth(
  handler: () => Promise<NextResponse>,
  request?: Request,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    log.warn('Unauthenticated request blocked');
    return NextResponse.json(
      { error: { message: 'Authentication required' } },
      { status: 401 },
    );
  }

  const rateResult = await checkRateLimit(session);
  if (!rateResult.success) {
    log.warn('Rate limit exceeded', { session });
    return NextResponse.json(
      { error: { message: 'Rate limit exceeded. Please try again later.' } },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(rateResult.limit),
          'X-RateLimit-Remaining': String(rateResult.remaining),
          'X-RateLimit-Reset': String(rateResult.reset),
          'Retry-After': String(Math.ceil((rateResult.reset - Date.now()) / 1000)),
        },
      },
    );
  }

  try {
    const response = await handler();
    response.headers.set('X-RateLimit-Limit', String(rateResult.limit));
    response.headers.set('X-RateLimit-Remaining', String(rateResult.remaining));
    response.headers.set('X-RateLimit-Reset', String(rateResult.reset));
    return response;
  } catch (err) {
    log.error('Handler error', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
    return NextResponse.json({ error: { message: 'Internal server error' } }, { status: 500 });
  }
}
