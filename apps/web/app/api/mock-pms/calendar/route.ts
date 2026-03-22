import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { PmsInventory, PmsHold } from '@/lib/models';
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

  // Ensure PMS data is seeded
  await pmsDb.seedPmsData();
  await connectDB();

  const jsMonth = month - 1;
  const daysInMonth = new Date(year, jsMonth + 1, 0).getDate();
  const allSpaces = await pmsDb.getSpaces();
  const spacesToCheck = spaceId
    ? allSpaces.filter((s) => s.id === spaceId)
    : guests
      ? allSpaces.filter((s) => s.capacity >= guests)
      : allSpaces;

  const TIME_SLOT_IDS = ['morning', 'afternoon', 'evening'];
  const spaceIds = spacesToCheck.map((s) => s.id);

  // Build date range for the month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // Batch query: all booked inventory for this month + spaces in 2 queries
  const [bookedSlots, activeHoldSlots] = await Promise.all([
    PmsInventory.find({
      spaceId: { $in: spaceIds },
      date: { $gte: startDate, $lte: endDate },
      timeSlotId: { $in: TIME_SLOT_IDS },
      booked: true,
    }).lean(),
    PmsHold.find({
      spaceId: { $in: spaceIds },
      date: { $gte: startDate, $lte: endDate },
      timeSlotId: { $in: TIME_SLOT_IDS },
      status: 'held',
      expiresAt: { $gt: new Date() },
    }).lean(),
  ]);

  // Build lookup sets for O(1) checks
  const bookedSet = new Set(bookedSlots.map((s) => `${s.spaceId}|${s.date}|${s.timeSlotId}`));
  const heldSet = new Set(activeHoldSlots.map((s) => `${s.spaceId}|${s.date}|${s.timeSlotId}`));

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

    let available = 0;
    let total = 0;
    for (const space of spacesToCheck) {
      for (const slotId of TIME_SLOT_IDS) {
        total++;
        const key = `${space.id}|${dateStr}|${slotId}`;
        if (!bookedSet.has(key) && !heldSet.has(key)) {
          available++;
        }
      }
    }

    const ratio = total > 0 ? available / total : 0;
    const status = ratio > 0.6 ? 'available' : ratio > 0.2 ? 'limited' : 'booked';

    days.push({ date: dateStr, day: d, dow, status, available_count: available, total_count: total });
  }

  // Holds for the month
  const allActiveHolds = await pmsDb.getActiveHolds();
  const holdsForMonth = allActiveHolds.filter((h) => {
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
