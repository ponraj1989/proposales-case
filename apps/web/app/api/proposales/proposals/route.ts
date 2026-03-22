import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getSDK } from '@/lib/sdk';
import { createProposalSchema, patchProposalDataSchema } from '@proposales/api-client';

const VISIBLE_PROPOSAL_STATUSES = [
  'draft',
  'active',
  'accepted',
  'rejected',
  'lost',
  'expired',
] as const;

// POST /api/proposales/proposals — Create proposal
export async function POST(request: Request) {
  return withAuth(async () => {
    try {
      const body = await request.json();
      const parsed = createProposalSchema.safeParse(body);

      if (!parsed.success) {
        console.error('[POST /proposals] Validation failed:', JSON.stringify(parsed.error.flatten()));
        return NextResponse.json(
          { error: { message: 'Invalid request body', details: parsed.error.flatten() } },
          { status: 400 },
        );
      }

      const sdk = getSDK();
      const result = await sdk.proposals.create(parsed.data);
      console.log('[POST /proposals] Created:', JSON.stringify(result));
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create proposal';
      console.error('[POST /proposals] Error:', message);
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}

// GET /api/proposales/proposals — Search proposals (enriched with full data)
export async function GET(request: Request) {
  return withAuth(async () => {
    try {
      const url = new URL(request.url);
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
      // The upstream API caps search results to a small page size.
      // We rely on sdk.proposals.searchAll() fan-out + dedupe, then apply local status filtering.
      const requestedStatus = filters.status;
      let items: Record<string, unknown>[] = [];

      const matchesStatus = (item: Record<string, unknown>, expectedStatus: string) =>
        typeof item.status === 'string' && item.status === expectedStatus;

      if (requestedStatus) {
        const rawItems = await sdk.proposals.searchAll(filters);
        items = (rawItems as unknown as Record<string, unknown>[])
          .filter((item) => matchesStatus(item, requestedStatus));
      } else {
        const rawItems = await sdk.proposals.searchAll(filters);
        const visibleStatuses = new Set<string>(VISIBLE_PROPOSAL_STATUSES);
        items = (rawItems as unknown as Record<string, unknown>[])
          .filter((item) => typeof item.status === 'string' && visibleStatuses.has(item.status));
      }

      // Enrich proposals with full details in batches of 10
      const batchSize = 10;
      const enriched: Record<string, unknown>[] = [];
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (item) => {
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
                tracking: p.tracking,
                viewed_count: p.tracking?.number_of_views ?? 0,
                first_viewed_at: p.tracking?.first_viewed_at,
                last_viewed_at: p.tracking?.last_viewed_at,
                sent_at: p.tracking?.sent_at,
                accepted_at: p.tracking?.accepted_at,
                rejected_at: p.tracking?.rejected_at,
                status_changed_at: p.status_changed_at,
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
        enriched.push(...batchResults);
      }

      return NextResponse.json({ data: enriched });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to search proposals';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}
