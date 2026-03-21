import connectDB from '@/lib/mongodb';
import { PmsSpace, PmsInventory, PmsHold, type IPmsSpace, type IPmsHold } from '@/lib/models';

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

const SEED_SPACES = [
  {
    spaceId: 'space-grand-ballroom',
    venueId: 'venue-1',
    name: 'Grand Ballroom',
    type: 'banquet',
    capacity: 500,
    basePriceCents: 5600000,
    amenities: ['Stage', 'Dance floor', 'Built-in AV', 'Chandeliers', 'Bridal suite access'],
    description: 'Our flagship event space — ideal for weddings, galas, and large conferences.',
  },
  {
    spaceId: 'space-boardroom',
    venueId: 'venue-1',
    name: 'Executive Boardroom',
    type: 'boardroom',
    capacity: 20,
    basePriceCents: 1590000,
    amenities: ['Smart TV', 'Whiteboard', 'Video conferencing', 'Espresso machine'],
    description: 'An intimate meeting space for executive sessions and board meetings.',
  },
  {
    spaceId: 'space-garden',
    venueId: 'venue-1',
    name: 'Rooftop Garden',
    type: 'outdoor',
    capacity: 150,
    basePriceCents: 3200000,
    amenities: ['Panoramic city view', 'Weather canopy', 'Bar area', 'Heating lamps'],
    description: 'A stunning outdoor terrace overlooking Stockholm — perfect for cocktail receptions and summer events.',
  },
  {
    spaceId: 'space-conference-a',
    venueId: 'venue-1',
    name: 'Conference Hall A',
    type: 'conference',
    capacity: 200,
    basePriceCents: 2800000,
    amenities: ['Projector', 'Podium', 'Microphones', 'Breakout rooms nearby'],
    description: 'A modern conference hall ideal for seminars, product launches, and corporate events.',
  },
  {
    spaceId: 'space-restaurant',
    venueId: 'venue-1',
    name: 'The Grand Restaurant',
    type: 'restaurant',
    capacity: 80,
    basePriceCents: 1800000,
    amenities: ['Private dining', 'Wine cellar', 'Chef table', 'Live cooking station'],
    description: 'Exclusive private dining for intimate dinner parties and celebrations.',
  },
];

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

/** Seed PMS data into MongoDB if not already present */
export async function seedPmsData(): Promise<void> {
  if (seeded) return;
  await connectDB();

  const spaceCount = await PmsSpace.countDocuments();
  if (spaceCount === 0) {
    await PmsSpace.insertMany(SEED_SPACES as IPmsSpace[]);
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

function calculatePrice(space: Space, date: string, slot: TimeSlot, guests: number): number {
  let price = space.base_price_cents;

  const d = new Date(date);
  const dayOfWeek = d.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) price = Math.round(price * 1.2);

  const month = d.getMonth();
  if (month >= 5 && month <= 7) price = Math.round(price * 1.15);

  if (slot.id === 'full-day') price = Math.round(price * 1.5);
  else if (slot.id === 'evening') price = Math.round(price * 1.1);
  else if (slot.id === 'morning') price = Math.round(price * 0.9);

  const utilizationRatio = guests / space.capacity;
  if (utilizationRatio > 0.8) price = Math.round(price * 1.1);
  if (utilizationRatio < 0.3) price = Math.round(price * 0.9);

  return price;
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

  const results: AvailableSlot[] = [];

  for (const space of suitableSpaces) {
    const slotsToCheck = query.time_slot
      ? TIME_SLOTS.filter((ts) => ts.id === query.time_slot || ts.label.toLowerCase() === query.time_slot?.toLowerCase())
      : TIME_SLOTS;

    for (const slot of slotsToCheck) {
      const slotStatus = await isSlotAvailable(space.id, query.date, slot.id);
      if (slotStatus.available) {
        const price = calculatePrice(space, query.date, slot, query.guests);
        results.push({
          space,
          date: query.date,
          time_slot: slot,
          price_cents: price,
          price_formatted: formatEUR(price),
        });
      }
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
