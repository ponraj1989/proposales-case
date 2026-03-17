import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getSDK } from '@/lib/sdk';
import {
  createContentSchema,
  updateContentSchema,
  bulkContentSchema,
} from '@proposales/api-client';

// GET /api/proposales/content
export async function GET(request: Request) {
  return withAuth(async () => {
    try {
      const url = new URL(request.url);
      const sdk = getSDK();
      const result = await sdk.content.list({
        product_id: url.searchParams.get('product_id') ?? undefined,
        variation_id: url.searchParams.get('variation_id') ?? undefined,
        include_archived: url.searchParams.get('include_archived') === 'true',
        include_sources: url.searchParams.get('include_sources') === 'true',
      });
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to list content';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}

// POST /api/proposales/content
export async function POST(request: Request) {
  return withAuth(async () => {
    try {
      const url = new URL(request.url);
      const action = url.searchParams.get('action');
      const body = await request.json();
      const sdk = getSDK();

      // Bulk restore
      if (action === 'restore') {
        const parsed = bulkContentSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: { message: 'Invalid request body', details: parsed.error.flatten() } },
            { status: 400 },
          );
        }
        const result = await sdk.content.bulkRestore(parsed.data);
        return NextResponse.json(result);
      }

      // Normal create
      const parsed = createContentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { message: 'Invalid request body', details: parsed.error.flatten() } },
          { status: 400 },
        );
      }
      const result = await sdk.content.create(parsed.data);
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create content';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}

// PUT /api/proposales/content
export async function PUT(request: Request) {
  return withAuth(async () => {
    try {
      const body = await request.json();
      const parsed = updateContentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { message: 'Invalid request body', details: parsed.error.flatten() } },
          { status: 400 },
        );
      }
      const sdk = getSDK();
      const result = await sdk.content.update(parsed.data);
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update content';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}

// DELETE /api/proposales/content
export async function DELETE(request: Request) {
  return withAuth(async () => {
    try {
      const url = new URL(request.url);
      const action = url.searchParams.get('action');
      const sdk = getSDK();

      // Bulk archive
      if (action === 'bulk') {
        const body = await request.json();
        const parsed = bulkContentSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: { message: 'Invalid request body', details: parsed.error.flatten() } },
            { status: 400 },
          );
        }
        const result = await sdk.content.bulkArchive(parsed.data);
        return NextResponse.json(result);
      }

      // Single delete
      const productId = url.searchParams.get('product_id');
      const variationId = url.searchParams.get('variation_id');

      if (!productId && !variationId) {
        return NextResponse.json(
          { error: { message: 'product_id or variation_id is required' } },
          { status: 400 },
        );
      }

      const result = await sdk.content.delete({
        product_id: productId ? parseInt(productId, 10) : undefined,
        variation_id: variationId ? parseInt(variationId, 10) : undefined,
      });
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete content';
      return NextResponse.json({ error: { message } }, { status: 500 });
    }
  });
}
