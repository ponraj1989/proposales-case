import connectDB from '@/lib/mongodb';
import { PmsSpace, PmsInventory, PmsHold, type IPmsSpace, type IPmsHold } from '@/lib/models';
import { getSDK } from '@/lib/sdk';

// ─── Types (matching packages/ai/src/tools/pms.ts) ───

export interface Venue {
  id: string;
  name: string;
  location: string;
  description: string;
}

export interface Space {
  id: string;
  venue_id: string;
  name: string;
  type: 'banquet' | 'boardroom' | 'outdoor' | 'conference' | 'restaurant';
  capacity: number;
  base_price_cents: number;
  amenities: string[];
  description: string;
}

export interface TimeSlot {
  id: string;
  label: string;
  start: string;
  end: string;
}

export interface HoldEntry {
  proposal_uuid: string;
  space_id: string;
  date: string;
  time_slot_id: string;
  guests: number;
  event_type?: string;
  contact_email?: string;
  contact_name?: string;
  held_at: string;
  expires_at: string;
  status: 'held' | 'confirmed' | 'expired' | 'released';
}

export interface AvailabilityQuery {
  date: string;
  guests: number;
  event_type?: string;
  time_slot?: string;
}

export interface AvailableSlot {
  space: Space;
  date: string;
  time_slot: TimeSlot;
  price_cents: number;
  price_formatted: string;
}

export interface BookingRequest {
  space_id: string;
  date: string;
  time_slot_id: string;
  event_type: string;
  guests: number;
  contact_email: string;
  contact_name: string;
  proposal_uuid?: string;
}

export interface BookingResult {
  success: boolean;
  booking_ref?: string;
  error?: string;
}

// ─── Static Data ───

const VENUE: Venue = {
  id: 'venue-1',
  name: 'Proposales Grand Hotel',
  location: 'Stockholm, Sweden',
  description: 'A premier event destination in central Stockholm offering world-class banquet halls, executive boardrooms, and scenic outdoor venues.',
};

const TIME_SLOTS: TimeSlot[] = [
  { id: 'morning', label: 'Morning', start: '08:00', end: '12:00' },
  { id: 'afternoon', label: 'Afternoon', start: '12:00', end: '17:00' },
  { id: 'evening', label: 'Evening', start: '17:00', end: '23:00' },
  { id: 'full-day', label: 'Full Day', start: '08:00', end: '23:00' },
];

// ─── Content → Space mapping ───
// Derives PMS spaces from the Proposales Content API instead of hardcoded data.
// Only content items whose title matches a known space keyword are treated as bookable spaces.

interface ContentItem {
  product_id: number;
  variation_id: number;
  title: Record<string, string>;
  description: Record<string, string>;
}

type SpaceProfile = {
  type?: Space['type'];
  capacity?: number;
  amenities?: string[];
};

const SPACE_KEYWORDS: Record<string, { type: Space['type']; capacity: number; amenities: string[] }> = {
  ballroom:    { type: 'banquet',     capacity: 500, amenities: ['Stage', 'Dance floor', 'Built-in AV', 'Chandeliers'] },
  banquet:     { type: 'banquet',     capacity: 300, amenities: ['Stage', 'Dance floor', 'Built-in AV', 'Banquet seating'] },
  boardroom:   { type: 'boardroom',   capacity: 20,  amenities: ['Smart TV', 'Whiteboard', 'Video conferencing', 'Espresso machine'] },
  conference:  { type: 'conference',  capacity: 200, amenities: ['Projector', 'Podium', 'Microphones', 'Breakout rooms nearby'] },
  restaurant:  { type: 'restaurant',  capacity: 80,  amenities: ['Private dining', 'Wine cellar', 'Chef table'] },
  garden:      { type: 'outdoor',     capacity: 150, amenities: ['Panoramic view', 'Weather canopy', 'Bar area', 'Heating lamps'] },
  rooftop:     { type: 'outdoor',     capacity: 150, amenities: ['Panoramic city view', 'Weather canopy', 'Bar area'] },
  pool:        { type: 'outdoor',     capacity: 100, amenities: ['Poolside seating', 'Bar service', 'Sun loungers'] },
  suite:       { type: 'boardroom',   capacity: 10,  amenities: ['Private lounge', 'Mini bar', 'Ensuite bathroom'] },
};

const EXACT_SPACE_PROFILES: Record<string, SpaceProfile> = {
  'banquet small': { type: 'banquet', capacity: 120, amenities: ['Stage', 'Dance floor', 'Built-in AV', 'Banquet seating'] },
  'banquet medium': { type: 'banquet', capacity: 300, amenities: ['Stage', 'Dance floor', 'Built-in AV', 'Banquet seating'] },
  'banquet grand': { type: 'banquet', capacity: 500, amenities: ['Stage', 'Dance floor', 'Built-in AV', 'Chandeliers'] },
  'boardroom small': { type: 'boardroom', capacity: 10, amenities: ['Smart TV', 'Whiteboard', 'Video conferencing'] },
  'boardroom medium': { type: 'boardroom', capacity: 20, amenities: ['Smart TV', 'Whiteboard', 'Video conferencing', 'Espresso machine'] },
  'boardroom grand': { type: 'boardroom', capacity: 40, amenities: ['Smart TV', 'Whiteboard', 'Video conferencing', 'Coffee station'] },
  'conference small': { type: 'conference', capacity: 80, amenities: ['Projector', 'Podium', 'Microphones'] },
  'conference medium': { type: 'conference', capacity: 150, amenities: ['Projector', 'Podium', 'Microphones', 'Breakout rooms nearby'] },
  'conference grand': { type: 'conference', capacity: 250, amenities: ['Projector', 'Podium', 'Microphones', 'Breakout rooms nearby'] },
  'grand ballroom': { type: 'banquet', capacity: 500, amenities: ['Stage', 'Dance floor', 'Built-in AV', 'Chandeliers'] },
};

const BASE_PRICES: Record<Space['type'], number> = {
  banquet: 250000,     // €2,500
  conference: 150000,  // €1,500
  boardroom: 50000,    // €500
  restaurant: 120000,  // €1,200
  outdoor: 200000,     // €2,000
};

// ─── Content Price Map (matches Proposales dashboard pricing) ───
// Prices are in cents. Unit types: 'person' | 'day' | 'unit'
export { getContentPrice, formatContentPrice, type ContentPrice } from './content-prices';
import { getContentPrice as lookupContentPrice } from './content-prices';

function normalizeSpaceText(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ');
}

function parseCapacityHint(title: string, description: string): number | null {
  const combined = `${title} ${description}`;
  const patterns = [
    /(\d+)\s*(?:max|pax|guests|people)/i,
    /capacity\s*[:\-]?\s*(\d+)/i,
    /up\s*to\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (!match) continue;
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function resolveSpaceProfile(title: string, description: string): SpaceProfile | null {
  const normalizedTitle = normalizeSpaceText(title);

  if (EXACT_SPACE_PROFILES[normalizedTitle]) {
    return EXACT_SPACE_PROFILES[normalizedTitle];
  }

  for (const [name, profile] of Object.entries(EXACT_SPACE_PROFILES)) {
    if (normalizedTitle.includes(name)) {
      return profile;
    }
  }

  const parsedCapacity = parseCapacityHint(normalizedTitle, description);
  if (parsedCapacity) {
    const matchedKeyword = Object.entries(SPACE_KEYWORDS).find(([keyword]) => normalizedTitle.includes(keyword));
    if (matchedKeyword) {
      return {
        type: matchedKeyword[1].type,
        capacity: parsedCapacity,
        amenities: matchedKeyword[1].amenities,
      };
    }
  }

  return null;
}

function contentToSeedSpace(item: ContentItem): Partial<IPmsSpace> | null {
  const title = item.title?.en || Object.values(item.title || {})[0] || '';
  const desc = (item.description?.en || Object.values(item.description || {})[0] || '');
  const normalizedTitle = normalizeSpaceText(title);
  const resolvedProfile = resolveSpaceProfile(title, desc);

  for (const [keyword, meta] of Object.entries(SPACE_KEYWORDS)) {
    if (normalizedTitle.includes(keyword)) {
      const slug = normalizedTitle.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      // Use the content price map so PMS availability matches the Spaces tab
      const contentPrice = lookupContentPrice(title);
      const type = resolvedProfile?.type ?? meta.type;
      const capacity = resolvedProfile?.capacity ?? meta.capacity;
      const amenities = resolvedProfile?.amenities ?? meta.amenities;
      const priceCents = contentPrice ? contentPrice.price_cents : BASE_PRICES[type];
      return {
        spaceId: `space-${slug}-${item.variation_id}`,
        venueId: 'venue-1',
        name: item.title?.en || Object.values(item.title || {})[0] || 'Unnamed Space',
        type,
        capacity,
        basePriceCents: priceCents,
        amenities,
        description: desc || `${item.title?.en || 'Space'} — available for events and bookings.`,
        contentVariationId: item.variation_id,
      };
    }
  }
  return null;
}

/** Fetch content items from Proposales API and map bookable spaces */
async function fetchContentSpaces(): Promise<Partial<IPmsSpace>[]> {
  try {
    const sdk = getSDK();
    const result = await sdk.content.list();
    const items: ContentItem[] = Array.isArray(result.data) ? result.data : [];
    const spaces: Partial<IPmsSpace>[] = [];
    for (const item of items) {
      const space = contentToSeedSpace(item);
      if (space) spaces.push(space);
    }
    return spaces;
  } catch (err) {
    console.error('Failed to fetch content for PMS spaces:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

// ─── Helpers ───

function formatEUR(cents: number): string {
  return `€${(cents / 100).toLocaleString('en-IE', { minimumFractionDigits: 2 })}`;
}

/** Deterministic pseudo-random for consistent seed data */
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

function dbSpaceToSpace(doc: IPmsSpace): Space {
  return {
    id: doc.spaceId,
    venue_id: doc.venueId,
    name: doc.name,
    type: doc.type,
    capacity: doc.capacity,
    base_price_cents: doc.basePriceCents,
    amenities: doc.amenities,
    description: doc.description,
  };
}

function dbHoldToHoldEntry(doc: IPmsHold): HoldEntry {
  return {
    proposal_uuid: doc.proposalUuid,
    space_id: doc.spaceId,
    date: doc.date,
    time_slot_id: doc.timeSlotId,
    guests: doc.guests,
    event_type: doc.eventType,
    contact_email: doc.contactEmail,
    contact_name: doc.contactName,
    held_at: doc.heldAt.toISOString(),
    expires_at: doc.expiresAt.toISOString(),
    status: doc.status,
  };
}

// ─── Seed & Init ───

let seeded = false;

// Bump this version whenever SPACE_KEYWORDS change to force a re-seed
const SEED_VERSION = 5;

/** Seed PMS data into MongoDB if not already present */
export async function seedPmsData(): Promise<void> {
  if (seeded) return;
  await connectDB();

  // Migration: drop old hardcoded spaces that lack contentVariationId
  const staleCount = await PmsSpace.countDocuments({ contentVariationId: { $exists: false } });
  if (staleCount > 0) {
    await PmsSpace.deleteMany({});
    await PmsInventory.deleteMany({});
  }

  // Re-seed when keyword mappings change (version bump)
  const existingSpace = await PmsSpace.findOne().lean();
  if (existingSpace && (existingSpace as unknown as { seedVersion?: number }).seedVersion !== SEED_VERSION) {
    await PmsSpace.deleteMany({});
    await PmsInventory.deleteMany({});
  }

  const spaceCount = await PmsSpace.countDocuments();
  if (spaceCount === 0) {
    const contentSpaces = await fetchContentSpaces();
    if (contentSpaces.length > 0) {
      await PmsSpace.insertMany(contentSpaces.map(s => ({ ...s, seedVersion: SEED_VERSION })));
    }
  }

  const invCount = await PmsInventory.countDocuments();
  if (invCount === 0) {
    const spaces = await PmsSpace.find().lean();
    const bulkOps: {
      spaceId: string;
      date: string;
      timeSlotId: string;
      booked: boolean;
      bookingRef?: string;
    }[] = [];

    const today = new Date();
    for (let d = 0; d < 90; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() + d);
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay();

      for (const space of spaces) {
        for (const slot of TIME_SLOTS) {
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const bookChance = isWeekend ? 0.4 : 0.2;
          const isBooked = seededRandom(dateStr + space.spaceId + slot.id) < bookChance;

          bulkOps.push({
            spaceId: space.spaceId,
            date: dateStr,
            timeSlotId: slot.id,
            booked: isBooked,
            bookingRef: isBooked ? `BK-${dateStr.replace(/-/g, '')}-${space.spaceId.slice(-4)}` : undefined,
          });
        }
      }
    }

    // Insert in batches of 1000
    for (let i = 0; i < bulkOps.length; i += 1000) {
      await PmsInventory.insertMany(bulkOps.slice(i, i + 1000));
    }
  }

  // Seed demo holds if none exist
  const holdCount = await PmsHold.countDocuments();
  if (holdCount === 0) {
    const spaces = await PmsSpace.find().lean();
    if (spaces.length > 0) {
      const today = new Date();
      const demoHolds: {
        proposalUuid: string;
        spaceId: string;
        date: string;
        timeSlotId: string;
        guests: number;
        eventType: string;
        contactEmail: string;
        contactName: string;
        heldAt: Date;
        expiresAt: Date;
        status: 'held';
      }[] = [];
      const slotIds = ['morning', 'afternoon', 'evening'];
      const eventTypes = ['Wedding Reception', 'Corporate Meeting', 'Gala Dinner', 'Conference', 'Product Launch'];
      const contacts = [
        { name: 'Emma Lindström', email: 'emma.lindstrom@example.com' },
        { name: 'Marcus Berg', email: 'marcus.berg@example.com' },
        { name: 'Sofia Karlsson', email: 'sofia.k@example.com' },
        { name: 'Johan Nilsson', email: 'johan.n@example.com' },
        { name: 'Anna Svensson', email: 'anna.s@example.com' },
      ];

      // Create holds spread across the next 30 days
      for (let d = 1; d <= 25; d += 5) {
        const date = new Date(today);
        date.setDate(today.getDate() + d);
        const dateStr = date.toISOString().split('T')[0];
        const space = spaces[d % spaces.length];
        const contact = contacts[d % contacts.length];
        const slot = slotIds[d % slotIds.length];
        const eventType = eventTypes[d % eventTypes.length];

        demoHolds.push({
          proposalUuid: `demo-hold-${dateStr}-${space.spaceId.slice(-6)}`,
          spaceId: space.spaceId,
          date: dateStr,
          timeSlotId: slot,
          guests: 20 + (d * 7) % 180,
          eventType,
          contactEmail: contact.email,
          contactName: contact.name,
          heldAt: today,
          expiresAt: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
          status: 'held',
        });
      }
      if (demoHolds.length > 0) {
        await PmsHold.insertMany(demoHolds);
      }
    }
  }

  seeded = true;
}

// ─── DB-Backed PMS Functions ───

export function getVenue(): Venue {
  return VENUE;
}

export async function getSpaces(): Promise<Space[]> {
  await seedPmsData();
  const docs = await PmsSpace.find({ venueId: 'venue-1' }).lean();
  return docs.map((d) => dbSpaceToSpace(d as IPmsSpace));
}

export function getTimeSlots(): TimeSlot[] {
  return TIME_SLOTS;
}

export async function isSlotAvailable(
  space_id: string,
  date: string,
  time_slot_id: string,
): Promise<{ available: boolean; reason?: string; held_by?: string }> {
  await seedPmsData();

  const entry = await PmsInventory.findOne({ spaceId: space_id, date, timeSlotId: time_slot_id }).lean();
  if (entry?.booked) {
    return { available: false, reason: `Already booked (ref: ${entry.bookingRef})` };
  }

  const activeHold = await PmsHold.findOne({
    spaceId: space_id,
    date,
    timeSlotId: time_slot_id,
    status: 'held',
    expiresAt: { $gt: new Date() },
  }).lean();

  if (activeHold) {
    const expiresIn = Math.ceil((new Date(activeHold.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return {
      available: false,
      reason: `Temporarily held for a pending proposal (expires in ${expiresIn} day${expiresIn !== 1 ? 's' : ''})`,
      held_by: activeHold.proposalUuid,
    };
  }

  return { available: true };
}

function calculatePrice(space: Space, _date: string, _slot: TimeSlot, _guests: number): number {
  // Return the base price directly — matches the Spaces tab pricing
  return space.base_price_cents;
}

export async function checkAvailability(query: AvailabilityQuery): Promise<AvailableSlot[]> {
  await seedPmsData();

  const allSpaces = await getSpaces();
  const suitableSpaces = allSpaces.filter((s) => s.capacity >= query.guests);

  const typePreference: Record<string, string[]> = {
    wedding: ['banquet', 'outdoor'],
    conference: ['conference', 'boardroom'],
    meeting: ['boardroom', 'conference'],
    dinner: ['restaurant', 'banquet'],
    party: ['banquet', 'outdoor', 'restaurant'],
    gala: ['banquet'],
    seminar: ['conference'],
    reception: ['outdoor', 'banquet', 'restaurant'],
  };
  const preferred = query.event_type ? typePreference[query.event_type.toLowerCase()] : undefined;

  const hasSlotFilter = Boolean(query.time_slot);
  const results: AvailableSlot[] = [];

  for (const space of suitableSpaces) {
    const slotsToCheck = hasSlotFilter
      ? TIME_SLOTS.filter((ts) => ts.id === query.time_slot || ts.label.toLowerCase() === query.time_slot?.toLowerCase())
      : TIME_SLOTS;

    let bestForSpace: AvailableSlot | null = null;

    for (const slot of slotsToCheck) {
      const slotStatus = await isSlotAvailable(space.id, query.date, slot.id);
      if (slotStatus.available) {
        const price = calculatePrice(space, query.date, slot, query.guests);
        const entry: AvailableSlot = {
          space,
          date: query.date,
          time_slot: slot,
          price_cents: price,
          price_formatted: formatEUR(price),
        };

        if (hasSlotFilter) {
          // When user picked a specific time slot, show all matching results
          results.push(entry);
        } else {
          // No slot filter — keep only the cheapest slot per space to avoid duplicates
          if (!bestForSpace || price < bestForSpace.price_cents) {
            bestForSpace = entry;
          }
        }
      }
    }

    if (!hasSlotFilter && bestForSpace) {
      results.push(bestForSpace);
    }
  }

  results.sort((a, b) => {
    if (preferred) {
      const aP = preferred.includes(a.space.type) ? 0 : 1;
      const bP = preferred.includes(b.space.type) ? 0 : 1;
      if (aP !== bP) return aP - bP;
    }
    return a.price_cents - b.price_cents;
  });

  return results;
}

export async function bookSpace(request: BookingRequest): Promise<BookingResult> {
  await seedPmsData();

  const slotStatus = await isSlotAvailable(request.space_id, request.date, request.time_slot_id);
  if (!slotStatus.available) {
    if (slotStatus.held_by && slotStatus.held_by === request.proposal_uuid) {
      // confirmation of a held slot — proceed
    } else {
      return { success: false, error: `Space is not available: ${slotStatus.reason}` };
    }
  }

  const result = await PmsInventory.findOneAndUpdate(
    { spaceId: request.space_id, date: request.date, timeSlotId: request.time_slot_id, booked: false },
    {
      booked: true,
      bookingRef: `BK-${Date.now().toString(36).toUpperCase()}-${request.space_id.slice(-4).toUpperCase()}`,
    },
    { new: true },
  );

  if (!result) {
    return { success: false, error: 'Slot is already booked or not found' };
  }

  return { success: true, booking_ref: result.bookingRef };
}

export async function holdSpace(request: {
  proposal_uuid: string;
  space_id: string;
  date: string;
  time_slot_id: string;
  guests: number;
  event_type?: string;
  contact_email?: string;
  contact_name?: string;
}): Promise<{ success: boolean; hold?: HoldEntry; error?: string }> {
  await seedPmsData();

  const availability = await isSlotAvailable(request.space_id, request.date, request.time_slot_id);
  if (!availability.available) {
    if (availability.held_by === request.proposal_uuid) {
      const existing = await PmsHold.findOne({
        proposalUuid: request.proposal_uuid,
        spaceId: request.space_id,
        status: 'held',
        expiresAt: { $gt: new Date() },
      }).lean();
      if (existing) return { success: true, hold: dbHoldToHoldEntry(existing as IPmsHold) };
    }
    return { success: false, error: `Space is not available: ${availability.reason}` };
  }

  const spaces = await getSpaces();
  const space = spaces.find((s) => s.id === request.space_id);
  if (!space) return { success: false, error: 'Space not found' };

  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + 7);

  const holdDoc = await PmsHold.create({
    proposalUuid: request.proposal_uuid,
    spaceId: request.space_id,
    date: request.date,
    timeSlotId: request.time_slot_id,
    guests: request.guests,
    eventType: request.event_type,
    contactEmail: request.contact_email,
    contactName: request.contact_name,
    heldAt: now,
    expiresAt: expires,
    status: 'held',
  });

  return { success: true, hold: dbHoldToHoldEntry(holdDoc) };
}

export async function confirmHold(proposalUuid: string): Promise<BookingResult & { hold?: HoldEntry }> {
  await seedPmsData();

  const activeHold = await PmsHold.findOne({
    proposalUuid,
    status: 'held',
    expiresAt: { $gt: new Date() },
  });

  if (!activeHold) {
    return { success: false, error: 'No active hold found for this proposal. The hold may have expired.' };
  }

  activeHold.status = 'confirmed';
  await activeHold.save();

  const result = await bookSpace({
    space_id: activeHold.spaceId,
    date: activeHold.date,
    time_slot_id: activeHold.timeSlotId,
    event_type: activeHold.eventType || 'event',
    guests: activeHold.guests,
    contact_email: activeHold.contactEmail || '',
    contact_name: activeHold.contactName || '',
    proposal_uuid: proposalUuid,
  });

  return { ...result, hold: dbHoldToHoldEntry(activeHold) };
}

export async function releaseHold(proposalUuid: string): Promise<{ success: boolean; released: number }> {
  await seedPmsData();
  const result = await PmsHold.updateMany(
    { proposalUuid, status: 'held' },
    { status: 'released' },
  );
  return { success: true, released: result.modifiedCount };
}

export async function getActiveHolds(): Promise<HoldEntry[]> {
  await seedPmsData();
  const docs = await PmsHold.find({
    status: 'held',
    expiresAt: { $gt: new Date() },
  }).lean();
  return docs.map((d) => dbHoldToHoldEntry(d as IPmsHold));
}
