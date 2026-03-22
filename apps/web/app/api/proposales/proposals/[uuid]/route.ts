import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getSDK } from '@/lib/sdk';
import { patchProposalDataSchema } from '@proposales/api-client';

// GET /api/proposales/proposals/[uuid]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  return withAuth(async () => {
    try {
      const { uuid } = await params;
      const sdk = getSDK();
      const result = await sdk.proposals.get(uuid);
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get proposal';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}

// PATCH /api/proposales/proposals/[uuid] — update proposal data sub-object
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  return withAuth(async () => {
    try {
      const { uuid } = await params;
      const body = await request.json();
      const parsed = patchProposalDataSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: { message: 'Invalid request body', details: parsed.error.flatten() } },
          { status: 400 },
        );
      }

      const sdk = getSDK();
      const result = await sdk.proposals.patchData(uuid, parsed.data);
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update proposal';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}
