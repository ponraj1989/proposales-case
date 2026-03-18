import { NextResponse } from 'next/server';
import { createSession, clearSession } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:auth');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const apiKey = body.key ?? body.apiKey;

    if (!apiKey || typeof apiKey !== 'string') {
      log.warn('Login attempt without API key');
      return NextResponse.json(
        { error: { message: 'API key is required' } },
        { status: 400 },
      );
    }

    const success = await createSession(apiKey);

    if (!success) {
      log.warn('Failed login attempt — invalid API key');
      return NextResponse.json(
        { error: { message: 'Invalid API key' } },
        { status: 401 },
      );
    }

    log.info('Successful API key login');
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error('Auth route error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  log.info('Session cleared');
  await clearSession();
  return NextResponse.json({ success: true });
}
