import { NextResponse } from 'next/server';
import { createSession, clearSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const apiKey = body.key ?? body.apiKey;

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: { message: 'API key is required' } },
        { status: 400 },
      );
    }

    const success = await createSession(apiKey);

    if (!success) {
      return NextResponse.json(
        { error: { message: 'Invalid API key' } },
        { status: 401 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ success: true });
}
