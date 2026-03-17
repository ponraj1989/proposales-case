import { NextResponse } from 'next/server';
import { checkRateLimit } from './rate-limiter';
import { getSession } from './auth';

export async function withAuth(
  handler: () => Promise<NextResponse>,
  request?: Request,
): Promise<NextResponse> {
  // Verify session
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { message: 'Authentication required' } },
      { status: 401 },
    );
  }

  // Rate limiting
  const rateResult = await checkRateLimit(session);
  if (!rateResult.success) {
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

  const response = await handler();

  // Attach rate limit headers
  response.headers.set('X-RateLimit-Limit', String(rateResult.limit));
  response.headers.set('X-RateLimit-Remaining', String(rateResult.remaining));
  response.headers.set('X-RateLimit-Reset', String(rateResult.reset));

  return response;
}
