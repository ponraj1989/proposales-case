import { NextResponse } from 'next/server';
import { createPasskeySession, clearSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const passkey = body.key ?? body.apiKey ?? body.passkey;

    if (!passkey || typeof passkey !== 'string') {
      return NextResponse.json(
        { error: { message: 'Passkey is required' } },
        { status: 400 },
      );
    }

    const result = await createPasskeySession(passkey);

    if (!result.success) {
      return NextResponse.json(
        { error: { message: result.error || 'Invalid passkey' } },
        { status: 401 },
      );
    }

    return NextResponse.json({ success: true, role: result.role });
  } catch (err) {
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
