import { z } from 'zod';
import { tool } from 'ai';

// ─── PMS Service Interface (for DB-backed implementations) ───

export interface PmsService {
  checkAvailability(query: AvailabilityQuery): Promise<AvailableSlot[]>;
  bookSpace(request: BookingRequest): Promise<BookingResult>;
  holdSpace(request: {
    proposal_uuid: string;
    space_id: string;
    date: string;
    time_slot_id: string;
    guests: number;
    event_type?: string;
    contact_email?: string;
    contact_name?: string;
  }): Promise<{ success: boolean; hold?: HoldEntry; error?: string }>;
  confirmHold(proposalUuid: string): Promise<BookingResult & { hold?: HoldEntry }>;
  releaseHold(proposalUuid: string): Promise<{ success: boolean; released: number }>;
  getActiveHolds(): Promise<HoldEntry[]>;
  isSlotAvailable(space_id: string, date: string, time_slot_id: string): Promise<{ available: boolean; reason?: string; held_by?: string }>;
  getVenue(): Venue | Promise<Venue>;
  getSpaces(): Space[] | Promise<Space[]>;
  getTimeSlots(): TimeSlot[];
}

// ─── Mock PMS Data ───

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

export interface InventoryEntry {
  space_id: string;
  date: string;
  time_slot_id: string;
  booked: boolean;
  booking_ref?: string;
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
  held_at: string;        // ISO timestamp when hold was created
  expires_at: string;     // ISO timestamp when hold expires (7 days)
  status: 'held' | 'confirmed' | 'expired' | 'released';
}

/** Format cents as EUR string */
function formatEUR(cents: number): string {
  return `€${(cents / 100).toLocaleString('en-IE', { minimumFractionDigits: 2 })}`;
}

// ─── Static Venue ───
// Spaces are now derived from the Proposales Content API (via PMS DB seeding).
// The in-memory fallback uses an empty list — always prefer the DB-backed PmsService.

const VENUE: Venue = {
  id: 'venue-1',
  name: 'Proposales Grand Hotel',
  location: 'Stockholm, Sweden',
  description: 'A premier event destination in central Stockholm offering world-class banquet halls, executive boardrooms, and scenic outdoor venues.',
};

// Spaces come from Proposales Content API via PMS DB — no hardcoded spaces.
const SPACES: Space[] = [];

const TIME_SLOTS: TimeSlot[] = [
  { id: 'morning', label: 'Morning', start: '08:00', end: '12:00' },
  { id: 'afternoon', label: 'Afternoon', start: '12:00', end: '17:00' },
  { id: 'evening', label: 'Evening', start: '17:00', end: '23:00' },
  { id: 'full-day', label: 'Full Day', start: '08:00', end: '23:00' },
];

// ─── In-Memory Inventory ───
// Pre-book a few slots to make availability realistic.

const inventory: InventoryEntry[] = [];

function initInventory() {
  if (inventory.length > 0) return;

  // Generate dates for next 90 days
  const today = new Date();
  for (let d = 0; d < 90; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

    for (const space of SPACES) {
      for (const slot of TIME_SLOTS) {
        // Simulate ~25% occupancy, more on weekends
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const bookChance = isWeekend ? 0.4 : 0.2;
        const isBooked = seededRandom(dateStr + space.id + slot.id) < bookChance;

        inventory.push({
          space_id: space.id,
          date: dateStr,
          time_slot_id: slot.id,
          booked: isBooked,
          booking_ref: isBooked ? `BK-${dateStr.replace(/-/g, '')}-${space.id.slice(-4)}` : undefined,
        });
      }
    }
  }
}

/** Deterministic pseudo-random for consistent demo data */
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

// ─── Holds System (7-day temporary blocks) ───

const holds: HoldEntry[] = [];

/** Check if a hold is still active (not expired, not released, not confirmed) */
function isHoldActive(hold: HoldEntry): boolean {
  if (hold.status !== 'held') return false;
  return new Date(hold.expires_at) > new Date();
}

/** Get all active holds for a specific slot */
function getActiveHoldsForSlot(space_id: string, date: string, time_slot_id: string): HoldEntry[] {
  return holds.filter(
    (h) => h.space_id === space_id && h.date === date && h.time_slot_id === time_slot_id && isHoldActive(h),
  );
}

/** Check if a slot is available (not booked AND not held) */
export function isSlotAvailable(space_id: string, date: string, time_slot_id: string): { available: boolean; reason?: string; held_by?: string } {
  initInventory();
  const entry = inventory.find(
    (inv) => inv.space_id === space_id && inv.date === date && inv.time_slot_id === time_slot_id,
  );

  if (entry?.booked) {
    return { available: false, reason: `Already booked (ref: ${entry.booking_ref})` };
  }

  const activeHolds = getActiveHoldsForSlot(space_id, date, time_slot_id);
  if (activeHolds.length > 0) {
    const hold = activeHolds[0];
    const expiresIn = Math.ceil((new Date(hold.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return {
      available: false,
      reason: `Temporarily held for a pending proposal (expires in ${expiresIn} day${expiresIn !== 1 ? 's' : ''})`,
      held_by: hold.proposal_uuid,
    };
  }

  return { available: true };
}

/**
 * Hold a space for 7 days when a proposal is generated.
 * Returns the hold or an error if the slot is already taken.
 */
export function holdSpace(request: {
  proposal_uuid: string;
  space_id: string;
  date: string;
  time_slot_id: string;
  guests: number;
  event_type?: string;
  contact_email?: string;
  contact_name?: string;
}): { success: boolean; hold?: HoldEntry; error?: string } {
  initInventory();

  // Check if slot is available
  const availability = isSlotAvailable(request.space_id, request.date, request.time_slot_id);
  if (!availability.available) {
    // Allow re-hold if same proposal is re-generating
    if (availability.held_by === request.proposal_uuid) {
      const existingHold = holds.find(
        (h) => h.proposal_uuid === request.proposal_uuid && h.space_id === request.space_id && isHoldActive(h),
      );
      if (existingHold) return { success: true, hold: existingHold };
    }
    return { success: false, error: `Space is not available: ${availability.reason}` };
  }

  const space = SPACES.find((s) => s.id === request.space_id);
  // Space validation is optional — content-derived spaces may not be in the in-memory list
  if (!space && SPACES.length > 0) return { success: false, error: 'Space not found' };

  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + 7);

  const hold: HoldEntry = {
    proposal_uuid: request.proposal_uuid,
    space_id: request.space_id,
    date: request.date,
    time_slot_id: request.time_slot_id,
    guests: request.guests,
    event_type: request.event_type,
    contact_email: request.contact_email,
    contact_name: request.contact_name,
    held_at: now.toISOString(),
    expires_at: expires.toISOString(),
    status: 'held',
  };

  holds.push(hold);
  return { success: true, hold };
}

/**
 * Confirm a hold → converts it to a confirmed booking in the PMS inventory.
 * Called when a proposal is e-signed / accepted.
 */
export function confirmHold(proposalUuid: string): BookingResult & { hold?: HoldEntry } {
  const activeHold = holds.find((h) => h.proposal_uuid === proposalUuid && isHoldActive(h));

  if (!activeHold) {
    // No active hold — try direct booking (the proposal may not have had space details)
    return { success: false, error: 'No active hold found for this proposal. The hold may have expired.' };
  }

  // Mark hold as confirmed
  activeHold.status = 'confirmed';

  // Book the slot in inventory
  const result = bookSpace({
    space_id: activeHold.space_id,
    date: activeHold.date,
    time_slot_id: activeHold.time_slot_id,
    event_type: activeHold.event_type || 'event',
    guests: activeHold.guests,
    contact_email: activeHold.contact_email || '',
    contact_name: activeHold.contact_name || '',
    proposal_uuid: proposalUuid,
  });

  return { ...result, hold: activeHold };
}

/**
 * Release a hold (e.g., proposal rejected or manually cancelled).
 */
export function releaseHold(proposalUuid: string): { success: boolean; released: number } {
  let released = 0;
  for (const h of holds) {
    if (h.proposal_uuid === proposalUuid && h.status === 'held') {
      h.status = 'released';
      released++;
    }
  }
  return { success: true, released };
}

/** Get all active holds (for admin/debug) */
export function getActiveHolds(): HoldEntry[] {
  return holds.filter(isHoldActive);
}

// ─── PMS Query Functions ───

export function getVenue() {
  return VENUE;
}

export function getSpaces() {
  return SPACES;
}

export function getTimeSlots() {
  return TIME_SLOTS;
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

export function checkAvailability(query: AvailabilityQuery): AvailableSlot[] {
  initInventory();

  const results: AvailableSlot[] = [];

  // Filter spaces that can accommodate the guest count
  const suitableSpaces = SPACES.filter((s) => s.capacity >= query.guests);

  // Map event types to preferred space types
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

  for (const space of suitableSpaces) {
    const slotsToCheck = query.time_slot
      ? TIME_SLOTS.filter((ts) => ts.id === query.time_slot || ts.label.toLowerCase() === query.time_slot?.toLowerCase())
      : TIME_SLOTS;

    for (const slot of slotsToCheck) {
      // Check both inventory bookings AND active holds
      const slotStatus = isSlotAvailable(space.id, query.date, slot.id);

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

  // Sort: preferred types first, then by price
  results.sort((a, b) => {
    if (preferred) {
      const aPreferred = preferred.includes(a.space.type) ? 0 : 1;
      const bPreferred = preferred.includes(b.space.type) ? 0 : 1;
      if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    }
    return a.price_cents - b.price_cents;
  });

  return results;
}

// ─── Dynamic Pricing ───

function calculatePrice(space: Space, _date: string, _slot: TimeSlot, _guests: number): number {
  // Return base price directly — matches the Spaces tab pricing
  return space.base_price_cents;
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

export function bookSpace(request: BookingRequest): BookingResult {
  initInventory();

  // Check overall slot availability (includes holds)
  const slotStatus = isSlotAvailable(request.space_id, request.date, request.time_slot_id);
  if (!slotStatus.available) {
    // Allow booking if the hold belongs to the same proposal (confirmation flow)
    if (slotStatus.held_by && slotStatus.held_by === request.proposal_uuid) {
      // This is the confirmation of a held slot — proceed
    } else {
      return { success: false, error: `Space is not available: ${slotStatus.reason}` };
    }
  }

  const entry = inventory.find(
    (inv) =>
      inv.space_id === request.space_id &&
      inv.date === request.date &&
      inv.time_slot_id === request.time_slot_id,
  );

  if (!entry) {
    return { success: false, error: 'Slot not found in inventory' };
  }

  if (entry.booked) {
    return { success: false, error: 'Slot is already booked' };
  }

  // Book it
  const ref = `BK-${Date.now().toString(36).toUpperCase()}-${request.space_id.slice(-4).toUpperCase()}`;
  entry.booked = true;
  entry.booking_ref = ref;

  return { success: true, booking_ref: ref };
}

// ─── AI Tools ───

export function createCheckAvailabilityTool(pms?: PmsService) {
  return tool({
    description:
      'Check venue availability at the hotel. Returns available spaces, time slots, and dynamic pricing for the given date and guest count. Call this BEFORE generating a proposal so you can recommend specific venues to the customer.',
    inputSchema: z.object({
      date: z.string().describe('Event date in YYYY-MM-DD format'),
      guests: z.number().min(1).describe('Number of guests/attendees'),
      event_type: z.string().optional().describe('Type of event: wedding, conference, meeting, dinner, party, gala, seminar, reception'),
      time_slot: z.string().optional().describe('Preferred time: morning, afternoon, evening, or full-day'),
    }),
    execute: async (input) => {
      const results = pms ? await pms.checkAvailability(input) : checkAvailability(input);
      const allSpaces = pms ? await pms.getSpaces() : SPACES;

      // Count unavailable slots (booked or held) for context
      const suitableSpaces = allSpaces.filter((s) => s.capacity >= input.guests);
      const unavailableSlots: { space_name: string; space_type: string; time_slot: string; reason: string }[] = [];
      for (const space of suitableSpaces) {
        const slotsToCheck = input.time_slot
          ? TIME_SLOTS.filter((ts) => ts.id === input.time_slot || ts.label.toLowerCase() === input.time_slot?.toLowerCase())
          : TIME_SLOTS;
        for (const slot of slotsToCheck) {
          const status = pms ? await pms.isSlotAvailable(space.id, input.date, slot.id) : isSlotAvailable(space.id, input.date, slot.id);
          if (!status.available) {
            unavailableSlots.push({
              space_name: space.name,
              space_type: space.type,
              time_slot: slot.label,
              reason: status.reason || 'Unavailable',
            });
          }
        }
      }

      const activeHolds = pms ? await pms.getActiveHolds() : getActiveHolds();
      const activeHoldsCount = activeHolds.length;

      if (results.length === 0) {
        return {
          available: false,
          message: `No available spaces found for ${input.guests} guests on ${input.date}. All suitable spaces are either booked or temporarily held for pending proposals.`,
          unavailable: unavailableSlots,
          active_holds: activeHoldsCount,
          suggestions: [
            'Try a different date',
            'Adjust the guest count',
            'Consider a different time slot',
            ...(activeHoldsCount > 0 ? ['Some spaces are held for pending proposals — they may become available if those proposals expire (7-day hold)'] : []),
          ],
        };
      }

      // Return top 5 options
      const options = results.slice(0, 5).map((r) => ({
        space_id: r.space.id,
        space_name: r.space.name,
        space_type: r.space.type,
        capacity: r.space.capacity,
        date: r.date,
        time_slot: r.time_slot.label,
        time_slot_id: r.time_slot.id,
        price: r.price_formatted,
        price_cents: r.price_cents,
        amenities: r.space.amenities,
        description: r.space.description,
      }));

      return {
        available: true,
        currency: 'EUR',
        venue: VENUE.name,
        location: VENUE.location,
        options,
        unavailable: unavailableSlots.length > 0 ? unavailableSlots : undefined,
        active_holds: activeHoldsCount > 0 ? activeHoldsCount : undefined,
        message: `Found ${options.length} available option${options.length > 1 ? 's' : ''} for ${input.guests} guests on ${input.date}. All prices are in EUR.${unavailableSlots.length > 0 ? ` Note: ${unavailableSlots.length} slot(s) are unavailable (booked or held).` : ''}`,
      };
    },
  });
}

export function createCalculateEventPriceTool(pms?: PmsService) {
  return tool({
    description:
      'Calculate the total price for an event based on space, date, guests, and add-ons. Use this when the customer wants a price estimate or to compare pricing across options. Returns a detailed price breakdown.',
    inputSchema: z.object({
      space_id: z.string().describe('Space ID from checkAvailability results'),
      date: z.string().describe('Event date in YYYY-MM-DD format'),
      time_slot: z.string().describe('Time slot: morning, afternoon, evening, or full-day'),
      guests: z.number().min(1).describe('Number of guests'),
      add_ons: z.array(z.enum([
        'all_meals',
        'breakfast',
        'lunch',
        'dinner',
        'projector',
        'accommodation',
        'transportation',
      ])).optional().describe('Additional services to include in the price'),
    }),
    execute: async (input) => {
      const allSpaces = pms ? await pms.getSpaces() : SPACES;
      const space = allSpaces.find((s) => s.id === input.space_id);
      if (!space) {
        return { success: false, error: 'Space not found' };
      }

      const slot = TIME_SLOTS.find((ts) => ts.id === input.time_slot || ts.label.toLowerCase() === input.time_slot.toLowerCase());
      if (!slot) {
        return { success: false, error: 'Invalid time slot' };
      }

      const venuePrice = calculatePrice(space, input.date, slot, input.guests);

      // Add-on pricing (per person, in cents)
      const addOnPrices: Record<string, { label: string; per_person_cents: number }> = {
        all_meals: { label: 'All Meals (Breakfast + Lunch + Dinner)', per_person_cents: 3180 },
        breakfast: { label: 'Breakfast', per_person_cents: 1200 },
        lunch: { label: 'Lunch', per_person_cents: 1590 },
        dinner: { label: 'Dinner', per_person_cents: 1908 },
        projector: { label: 'Projector & AV Equipment', per_person_cents: 1500 },
        accommodation: { label: 'Hotel Accommodation', per_person_cents: 5300 },
        transportation: { label: 'Transportation', per_person_cents: 2500 },
      };

      const breakdown: { item: string; amount_cents: number; amount: string; note: string }[] = [
        {
          item: `${space.name} — ${slot.label}`,
          amount_cents: venuePrice,
          amount: formatEUR(venuePrice),
          note: `Capacity: ${space.capacity} | Guests: ${input.guests}`,
        },
      ];

      let addOnsTotal = 0;
      for (const addOn of input.add_ons ?? []) {
        const info = addOnPrices[addOn];
        if (info) {
          const cost = info.per_person_cents * input.guests;
          addOnsTotal += cost;
          breakdown.push({
            item: info.label,
            amount_cents: cost,
            amount: formatEUR(cost),
            note: `€${(info.per_person_cents / 100).toFixed(2)} × ${input.guests} guests`,
          });
        }
      }

      const subtotal = venuePrice + addOnsTotal;
      const tax = Math.round(subtotal * 0.25); // 25% Swedish VAT
      const total = subtotal + tax;

      // Generate smart pricing tips
      const pricingTips: string[] = [];
      const d = new Date(input.date);
      const month = d.getMonth();
      const dayOfWeek = d.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isPeakSummer = month >= 5 && month <= 7;
      const isChristmas = month === 11 || month === 0;
      const isEaster = month === 2 || month === 3;
      const isOffPeak = month === 1 || (month >= 8 && month <= 10);
      const utilizationRatio = input.guests / space.capacity;

      if (isPeakSummer) {
        pricingTips.push('☀️ Peak summer season surcharge (+15%) is applied. Moving to Sep–Nov could save ~15%.');
      }
      if (isChristmas) {
        pricingTips.push('🎄 Christmas/New Year holiday surcharge (+20%) is active. Jan mid–Feb offers significantly lower rates.');
      }
      if (isEaster) {
        pricingTips.push('🐣 Easter week surcharge (+10%) is applied. Dates outside Mar–Apr avoid this premium.');
      }
      if (isWeekend) {
        pricingTips.push('📆 Weekend premium (+20%) is active. A weekday event would save ~20%.');
      }
      if (isOffPeak) {
        pricingTips.push('💰 Off-peak season (8% discount applied) — great timing for competitive pricing and negotiation leverage.');
      }
      if (utilizationRatio > 0.8) {
        pricingTips.push(`👥 High utilization (${Math.round(utilizationRatio * 100)}% capacity) — 10% surcharge applied. A larger space removes this.`);
      }
      if (utilizationRatio < 0.3) {
        pricingTips.push(`👥 Small group discount (10% off) — only using ${Math.round(utilizationRatio * 100)}% of capacity.`);
      }
      pricingTips.push('🤝 Negotiation: Round 1 → 5–8% off | Round 2 → 10–15% off | Round 3 (final) → up to 20% off.');
      if (!(input.add_ons ?? []).includes('all_meals') && !(input.add_ons ?? []).some(a => ['breakfast', 'lunch', 'dinner'].includes(a))) {
        pricingTips.push('🍽️ Tip: Adding the All Meals package saves ~€3/person vs booking meals individually.');
      }
      if (input.guests >= 50 && !(input.add_ons ?? []).includes('accommodation')) {
        pricingTips.push('🏨 Consider adding accommodation — groups of 50+ often bundle overnight stays for a better deal.');
      }

      return {
        success: true,
        currency: 'EUR',
        space_name: space.name,
        date: input.date,
        time_slot: slot.label,
        guests: input.guests,
        breakdown,
        subtotal: formatEUR(subtotal),
        subtotal_cents: subtotal,
        tax: formatEUR(tax),
        tax_cents: tax,
        tax_rate: '25% VAT',
        total: formatEUR(total),
        total_cents: total,
        pricing_tips: pricingTips,
      };
    },
  });
}

// ─── Monthly Availability Calendar Tool ───

export function createGetMonthAvailabilityTool(pms?: PmsService) {
  return tool({
    description:
      'Get a month-view availability calendar for a venue space. Returns every day in the month with green/yellow/red availability status. Call this when the customer asks to see available dates, wants a calendar view, or asks "when is the venue available?".',
    inputSchema: z.object({
      year: z.number().describe('Year (e.g. 2026)'),
      month: z.number().min(1).max(12).describe('Month (1-12)'),
      space_id: z.string().optional().describe('Optional space ID to filter. If omitted, shows aggregate for all spaces.'),
      guests: z.number().min(1).optional().describe('Guest count to filter suitable spaces'),
    }),
    execute: async (input) => {
      if (!pms) initInventory();

      const year = input.year;
      const month = input.month - 1; // JS months are 0-indexed
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const allSpaces = pms ? await pms.getSpaces() : SPACES;
      const spacesToCheck = input.space_id
        ? allSpaces.filter((s) => s.id === input.space_id)
        : input.guests
          ? allSpaces.filter((s) => s.capacity >= input.guests!)
          : allSpaces;

      const days: { date: string; day: number; dow: number; status: 'available' | 'limited' | 'booked'; slots_available: number; slots_total: number }[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, month, d);
        const dateStr = dateObj.toISOString().split('T')[0];
        const dow = dateObj.getDay();

        let totalSlots = 0;
        let availableSlots = 0;

        for (const space of spacesToCheck) {
          for (const slot of TIME_SLOTS.filter((ts) => ts.id !== 'full-day')) {
            totalSlots++;
            // Check both bookings and holds
            const slotStatus = pms ? await pms.isSlotAvailable(space.id, dateStr, slot.id) : isSlotAvailable(space.id, dateStr, slot.id);
            if (slotStatus.available) {
              availableSlots++;
            }
          }
        }

        const ratio = totalSlots > 0 ? availableSlots / totalSlots : 0;
        const status = ratio > 0.6 ? 'available' : ratio > 0.2 ? 'limited' : 'booked';

        days.push({ date: dateStr, day: d, dow, status, slots_available: availableSlots, slots_total: totalSlots });
      }

      const spaceName = input.space_id
        ? spacesToCheck[0]?.name || 'Unknown'
        : `All spaces${input.guests ? ` (≥${input.guests} pax)` : ''}`;

      return {
        type: 'availability_calendar',
        year,
        month: input.month,
        month_name: new Date(year, month).toLocaleString('en-US', { month: 'long' }),
        space_name: spaceName,
        days,
        summary: {
          available: days.filter((d) => d.status === 'available').length,
          limited: days.filter((d) => d.status === 'limited').length,
          booked: days.filter((d) => d.status === 'booked').length,
        },
      };
    },
  });
}

// ─── Floor Plan Layout Tool ───

export function createSuggestFloorPlanTool(pms?: PmsService) {
  return tool({
    description:
      'Suggest a seating/floor plan layout based on the event type, guest count, and selected space. Returns an SVG-friendly layout type (theater, classroom, banquet, u-shape, boardroom, cocktail) with dimensions. Call this after the customer describes their event and before generating the proposal.',
    inputSchema: z.object({
      space_id: z.string().describe('Space ID'),
      guests: z.number().min(1).describe('Number of guests'),
      event_type: z.string().describe('Type of event: wedding, conference, meeting, dinner, party, seminar'),
      setup_preference: z.string().optional().describe('User preference: theater, classroom, banquet, u-shape, boardroom, cocktail'),
    }),
    execute: async (input) => {
      const allSpaces = pms ? await pms.getSpaces() : SPACES;
      const space = allSpaces.find((s) => s.id === input.space_id);
      if (!space) return { success: false, error: 'Space not found' };

      // Auto-suggest layout based on event type
      const autoLayouts: Record<string, string> = {
        wedding: 'banquet',
        conference: 'theater',
        seminar: 'classroom',
        meeting: input.guests <= 20 ? 'boardroom' : 'classroom',
        dinner: 'banquet',
        party: 'cocktail',
        gala: 'banquet',
        reception: 'cocktail',
        workshop: 'classroom',
      };

      const layout = input.setup_preference || autoLayouts[input.event_type.toLowerCase()] || 'theater';

      // Capacity factors per layout
      const capacityFactors: Record<string, number> = {
        theater: 1.0,
        classroom: 0.6,
        banquet: 0.7,
        'u-shape': 0.3,
        boardroom: 0.15,
        cocktail: 1.2,
      };

      const maxCapacity = Math.floor(space.capacity * (capacityFactors[layout] || 0.7));
      const fits = input.guests <= maxCapacity;

      return {
        type: 'floor_plan',
        space_name: space.name,
        space_type: space.type,
        layout,
        guests: input.guests,
        max_capacity_for_layout: maxCapacity,
        fits,
        recommendation: fits
          ? `${layout.charAt(0).toUpperCase() + layout.slice(1)} setup in ${space.name} comfortably fits ${input.guests} guests (max ${maxCapacity}).`
          : `${layout.charAt(0).toUpperCase() + layout.slice(1)} setup only fits ${maxCapacity} guests. Consider ${space.name} with a different layout or a larger space.`,
        layouts_available: Object.entries(capacityFactors).map(([l, f]) => ({
          layout: l,
          max_capacity: Math.floor(space.capacity * f),
          fits_guests: input.guests <= Math.floor(space.capacity * f),
        })),
      };
    },
  });
}
