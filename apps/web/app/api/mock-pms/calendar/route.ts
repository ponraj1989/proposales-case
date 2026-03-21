import { NextResponse } from 'next/server';
import * as pmsDb from '@/lib/pms-db';

// GET /api/mock-pms/calendar?year=2026&month=4&guests=100&space_id=space-grand-ballroom
export async function GET(request: Request) {
  const url = new URL(request.url);
  const yearStr = url.searchParams.get('year');
  const monthStr = url.searchParams.get('month');
  const guestsStr = url.searchParams.get('guests');
  const spaceId = url.searchParams.get('space_id');

  if (!yearStr || !monthStr) {
    return NextResponse.json(
      { error: { message: 'year and month are required query parameters' } },
      { status: 400 },
    );
  }

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const guests = guestsStr ? parseInt(guestsStr, 10) : undefined;

  if (month < 1 || month > 12) {
    return NextResponse.json(
      { error: { message: 'month must be between 1 and 12' } },
      { status: 400 },
    );
  }

  const jsMonth = month - 1;
  const daysInMonth = new Date(year, jsMonth + 1, 0).getDate();
  const allSpaces = await pmsDb.getSpaces();
  const spacesToCheck = spaceId
    ? allSpaces.filter((s) => s.id === spaceId)
    : guests
      ? allSpaces.filter((s) => s.capacity >= guests)
      : allSpaces;

  const TIME_SLOT_IDS = ['morning', 'afternoon', 'evening'];

  const days: {
    date: string;
    day: number;
    dow: number;
    status: 'available' | 'limited' | 'booked';
    available_count: number;
    total_count: number;
  }[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, jsMonth, d);
    const dateStr = dateObj.toISOString().split('T')[0];
    const dow = dateObj.getDay();

    const results = await pmsDb.checkAvailability({
      date: dateStr,
      guests: guests || 1,
    });

    // Count available slots across matching spaces
    let available = 0;
    let total = 0;
    for (const space of spacesToCheck) {
      for (const slotId of TIME_SLOT_IDS) {
        total++;
        if (results.some((r) => r.space.id === space.id && r.time_slot.id === slotId)) {
          available++;
        }
      }
    }

    const ratio = total > 0 ? available / total : 0;
    const status = ratio > 0.6 ? 'available' : ratio > 0.2 ? 'limited' : 'booked';

    days.push({ date: dateStr, day: d, dow, status, available_count: available, total_count: total });
  }

  const activeHolds = await pmsDb.getActiveHolds();
  const holdsForMonth = activeHolds.filter((h) => {
    const hDate = new Date(h.date);
    return hDate.getFullYear() === year && hDate.getMonth() === jsMonth;
  });

  return NextResponse.json({
    year,
    month,
    month_name: new Date(year, jsMonth).toLocaleString('en-US', { month: 'long' }),
    days,
    holds: holdsForMonth.map((h) => ({
      date: h.date,
      space_id: h.space_id,
      space_name: allSpaces.find((s) => s.id === h.space_id)?.name || h.space_id,
      time_slot_id: h.time_slot_id,
      expires_at: h.expires_at,
      status: h.status,
    })),
    summary: {
      available: days.filter((d) => d.status === 'available').length,
      limited: days.filter((d) => d.status === 'limited').length,
      booked: days.filter((d) => d.status === 'booked').length,
      active_holds: holdsForMonth.length,
    },
  });
}
