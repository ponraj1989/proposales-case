import { NextResponse } from 'next/server';
import * as pmsDb from '@/lib/pms-db';

// POST /api/mock-pms/book — Reserve a space
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { space_id, date, time_slot_id, event_type, guests, contact_email, contact_name, proposal_uuid } = body;

    if (!space_id || !date || !time_slot_id || !guests || !contact_email) {
      return NextResponse.json(
        { error: { message: 'space_id, date, time_slot_id, guests, and contact_email are required' } },
        { status: 400 },
      );
    }

    const result = await pmsDb.bookSpace({
      space_id,
      date,
      time_slot_id,
      event_type: event_type || 'event',
      guests: Number(guests),
      contact_email,
      contact_name: contact_name || '',
      proposal_uuid,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: { message: result.error } },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      booking_ref: result.booking_ref,
      message: `Space booked. Reference: ${result.booking_ref}`,
    });
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid request body' } },
      { status: 400 },
    );
  }
}
