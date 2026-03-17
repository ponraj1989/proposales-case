import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getSDK } from '@/lib/sdk';
import { createProposalSchema, patchProposalDataSchema } from '@proposales/api-client';

// POST /api/proposales/proposals — Create proposal
export async function POST(request: Request) {
  return withAuth(async () => {
    try {
      const body = await request.json();
      const parsed = createProposalSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: { message: 'Invalid request body', details: parsed.error.flatten() } },
          { status: 400 },
        );
      }

      const sdk = getSDK();
      const result = await sdk.proposals.create(parsed.data);
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create proposal';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}

// GET /api/proposales/proposals — Search proposals
export async function GET(request: Request) {
  return withAuth(async () => {
    try {
      const url = new URL(request.url);
      const limit = url.searchParams.get('limit');
      const filters: Record<string, string> = {};

      for (const [key, value] of url.searchParams.entries()) {
        if (key.startsWith('filter[') && key.endsWith(']')) {
          const filterKey = key.slice(7, -1);
          filters[filterKey] = value;
        }
      }

      const sdk = getSDK();
      const result = await sdk.proposals.search(
        Object.keys(filters).length > 0 ? filters : undefined,
        limit ? parseInt(limit, 10) : 25,
      );
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to search proposals';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}
