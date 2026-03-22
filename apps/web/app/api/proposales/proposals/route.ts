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

// GET /api/proposales/proposals — Search proposals (enriched with full data)
export async function GET(request: Request) {
  return withAuth(async () => {
    try {
      const url = new URL(request.url);
      const limit = url.searchParams.get('limit');
      const filters: Record<string, string> = {};

      // Support filter[key]=value format
      for (const [key, value] of url.searchParams.entries()) {
        if (key.startsWith('filter[') && key.endsWith(']')) {
          const filterKey = key.slice(7, -1);
          filters[filterKey] = value;
        }
      }

      // Also support plain query params from the frontend
      const status = url.searchParams.get('status');
      const text = url.searchParams.get('text');
      if (status && !filters.status) filters.status = status;
      if (text && !filters.text) filters.text = text;

      const sdk = getSDK();
      const searchResult = await sdk.proposals.search(
        Object.keys(filters).length > 0 ? filters : undefined,
        limit ? parseInt(limit, 10) : 50,
      );

      // Enrich search results with full proposal data (value, contact, tracking, etc.)
      const searchData = searchResult.data;
      const items: Record<string, unknown>[] = Array.isArray(searchData) ? (searchData as unknown as Record<string, unknown>[]) : searchData ? [searchData as unknown as Record<string, unknown>] : [];

      const enriched = await Promise.all(
        items.map(async (item) => {
          const uuid = (item as { uuid?: string }).uuid;
          if (!uuid) return item;
          try {
            const full = await sdk.proposals.get(uuid);
            const p = full.data;
            return {
              ...item,
              title_md: p.title_md,
              description_md: p.description_md,
              value_with_tax: p.value_with_tax,
              value_without_tax: p.value_without_tax,
              currency: p.currency,
              contact_name: p.contact_name,
              contact_email: p.contact_email,
              recipient_name: p.recipient_name,
              recipient_email: p.recipient_email,
              viewed_count: p.tracking?.number_of_views ?? 0,
              first_viewed_at: p.tracking?.first_viewed_at,
              last_viewed_at: p.tracking?.last_viewed_at,
              sent_at: p.tracking?.sent_at,
              accepted_at: p.tracking?.accepted_at,
              rejected_at: p.tracking?.rejected_at,
              pdf_url: p.pdf_url,
              expires_at: p.expires_at,
              blocks: p.blocks,
              signatures: p.signatures,
            };
          } catch {
            return item;
          }
        }),
      );

      return NextResponse.json({ data: enriched });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to search proposals';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}
