import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getSDK } from '@/lib/sdk';

// GET /api/proposales/companies
export async function GET() {
  return withAuth(async () => {
    try {
      const sdk = getSDK();
      const result = await sdk.companies.list();
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list companies';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}
