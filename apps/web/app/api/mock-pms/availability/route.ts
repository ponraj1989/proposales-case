import { NextResponse } from 'next/server';
import * as pmsDb from '@/lib/pms-db';

// GET /api/mock-pms/availability?date=2026-06-15&guests=100&event_type=wedding&time_slot=evening
export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const guestsStr = url.searchParams.get('guests');

  if (!date || !guestsStr) {
    return NextResponse.json(
      { error: { message: 'date and guests are required query parameters' } },
      { status: 400 },
    );
  }

  const guests = parseInt(guestsStr, 10);
  if (isNaN(guests) || guests < 1) {
    return NextResponse.json(
      { error: { message: 'guests must be a positive number' } },
      { status: 400 },
    );
  }

  const results = await pmsDb.checkAvailability({
    date,
    guests,
    event_type: url.searchParams.get('event_type') || undefined,
    time_slot: url.searchParams.get('time_slot') || undefined,
  });

  return NextResponse.json({
    available: results.length > 0,
    count: results.length,
    results: results.slice(0, 10).map((r) => ({
      space_id: r.space.id,
      space_name: r.space.name,
      space_type: r.space.type,
      capacity: r.space.capacity,
      date: r.date,
      time_slot: r.time_slot.label,
      time_slot_id: r.time_slot.id,
      price_cents: r.price_cents,
      price: r.price_formatted,
      amenities: r.space.amenities,
    })),
  });
}
