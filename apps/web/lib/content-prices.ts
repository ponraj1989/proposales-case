// ─── Content Price Map (matches Proposales dashboard pricing) ───
// Shared client/server module — no server-only imports.

export interface ContentPrice {
  price_cents: number;
  unit_type: 'person' | 'day' | 'unit';
}

const CONTENT_PRICE_MAP: Record<string, ContentPrice> = {
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
  'decoration':               { price_cents: 10000,  unit_type: 'unit' },
  'coffee and snacks':        { price_cents: 500,    unit_type: 'person' },
  'coffee':                   { price_cents: 500,    unit_type: 'person' },
  'snacks':                   { price_cents: 500,    unit_type: 'person' },
};

/** Look up the price for a content item by its title */
export function getContentPrice(title: string): ContentPrice | null {
  const lower = title.toLowerCase().trim();
  if (CONTENT_PRICE_MAP[lower]) return CONTENT_PRICE_MAP[lower];
  let best: ContentPrice | null = null;
  let bestLen = 0;
  for (const [key, val] of Object.entries(CONTENT_PRICE_MAP)) {
    if (lower.includes(key) && key.length > bestLen) {
      best = val;
      bestLen = key.length;
    }
  }
  return best;
}

/** Format a content price for display — e.g. "€80/person" */
export function formatContentPrice(price: ContentPrice): string {
  const euros = price.price_cents / 100;
  const formatted = euros >= 1000
    ? `€${euros.toLocaleString('en-IE', { maximumFractionDigits: 0 })}`
    : `€${euros}`;
  return `${formatted}/${price.unit_type}`;
}
