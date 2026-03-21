import { NextResponse } from 'next/server';
import * as pmsDb from '@/lib/pms-db';

// GET /api/mock-pms/venue — Get venue info, spaces, and time slots
export async function GET(): Promise<NextResponse> {
  const [spaces] = await Promise.all([pmsDb.getSpaces()]);
  return NextResponse.json({
    venue: pmsDb.getVenue(),
    spaces,
    time_slots: pmsDb.getTimeSlots(),
  });
}
