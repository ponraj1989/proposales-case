import { NextResponse } from 'next/server';
import { createRfpSchema } from '@proposales/api-client';
import { getSDK } from '@/lib/sdk';

// POST /api/proposales/inbox/[token] — Public endpoint
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const parsed = createRfpSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: 'Invalid request body', details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const sdk = getSDK();
    const result = await sdk.inbox.createRfp(token, parsed.data);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create RFP';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
