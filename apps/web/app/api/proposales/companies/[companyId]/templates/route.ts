import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getSDK } from '@/lib/sdk';

// GET /api/proposales/companies/[companyId]/templates
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  return withAuth(async () => {
    try {
      const { companyId } = await params;
      const id = parseInt(companyId, 10);
      if (isNaN(id)) {
        return NextResponse.json(
          { error: { message: 'Invalid company ID' } },
          { status: 400 },
        );
      }
      const sdk = getSDK();
      const result = await sdk.companies.listTemplates(id);
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list templates';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}
