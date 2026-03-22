import { z } from 'zod';
import { tool } from 'ai';
import type { ProposalesSDK } from '@proposales/api-client';

// Content price map for enriching listContent results
const CONTENT_PRICE_MAP: Record<string, { price_cents: number; unit_type: string }> = {
  'all meals':                { price_cents: 8000,   unit_type: 'person' },
  'full board':               { price_cents: 8000,   unit_type: 'person' },
  'boardroom medium':         { price_cents: 22000,  unit_type: 'day' },
  'double room standard':     { price_cents: 7600,   unit_type: 'day' },
  'double room':              { price_cents: 7600,   unit_type: 'day' },
  'projector':                { price_cents: 1500,   unit_type: 'day' },
  'breakfast':                { price_cents: 1800,   unit_type: 'person' },
  'lunch':                    { price_cents: 2500,   unit_type: 'person' },
  'dinner':                   { price_cents: 2500,   unit_type: 'person' },
  'transportation':           { price_cents: 2500,   unit_type: 'person' },
  'boardroom grand':          { price_cents: 30000,  unit_type: 'day' },
  'boardroom small':          { price_cents: 15000,  unit_type: 'day' },
  'banquet small':            { price_cents: 50000,  unit_type: 'day' },
  'banquet medium':           { price_cents: 80000,  unit_type: 'day' },
  'banquet grand':            { price_cents: 100000, unit_type: 'day' },
  'single room':              { price_cents: 5000,   unit_type: 'day' },
  'suite room':               { price_cents: 10000,  unit_type: 'day' },
  'suite':                    { price_cents: 10000,  unit_type: 'day' },
  'microphones and speakers': { price_cents: 1000,   unit_type: 'day' },
  'microphone':               { price_cents: 1000,   unit_type: 'day' },
  'stage decors':             { price_cents: 10000,  unit_type: 'unit' },
  'stage decoration':         { price_cents: 10000,  unit_type: 'unit' },
  'coffee and snacks':        { price_cents: 500,    unit_type: 'person' },
  'coffee':                   { price_cents: 500,    unit_type: 'person' },
};

function lookupPrice(title: string): { price: string; unit_type: string } | null {
  const lower = title.toLowerCase().trim();
  const exact = CONTENT_PRICE_MAP[lower];
  if (exact) return { price: `€${(exact.price_cents / 100).toFixed(2)}`, unit_type: exact.unit_type };
  for (const [key, val] of Object.entries(CONTENT_PRICE_MAP)) {
    if (lower.includes(key)) return { price: `€${(val.price_cents / 100).toFixed(2)}`, unit_type: val.unit_type };
  }
  return null;
}

export function createListContentTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'List available content items (rooms, venues, meals, services, equipment) from the content library with pricing. ALWAYS call this before building any proposal to get valid variation_ids and prices. Each item includes variation_id (use as content_id in proposals), title, description, price, and unit_type.',
    inputSchema: z.object({
      include_archived: z
        .boolean()
        .optional()
        .describe('Whether to include archived content'),
    }),
    execute: async ({ include_archived }) => {
      const result = await sdk.content.list({ include_archived });
      // Enrich items with pricing info
      const items = Array.isArray(result.data) ? result.data : [];
      const enriched = items.map((item) => {
        const title = item.title?.en || Object.values(item.title || {})[0] || '';
        const priceInfo = lookupPrice(title);
        return {
          ...item,
          price: priceInfo?.price ?? null,
          unit_type: priceInfo?.unit_type ?? null,
          price_display: priceInfo ? `${priceInfo.price}/${priceInfo.unit_type}` : null,
        };
      });
      return { ...result, data: enriched };
    },
  });
}

export function createListCompaniesTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'List all companies the user has access to. Use when needing company information for creating proposals.',
    inputSchema: z.object({}),
    execute: async () => {
      const result = await sdk.companies.list();
      return result;
    },
  });
}

export function createListTemplatesTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'List proposal templates for a specific company. Use when the user wants to see available templates or start a proposal from a template.',
    inputSchema: z.object({
      company_id: z.number().describe('The company ID to list templates for'),
    }),
    execute: async ({ company_id }) => {
      const result = await sdk.companies.listTemplates(company_id);
      return result;
    },
  });
}
