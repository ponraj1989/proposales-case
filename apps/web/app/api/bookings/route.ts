import { NextResponse } from 'next/server';
import { getSession, getUserId } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import { Booking } from '@/lib/models';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { message: 'Authentication required' } }, { status: 401 });
  }

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ bookings: [] });
  }

  await connectDB();
  const bookings = await Booking.find({ userId })
    .populate('eventId')
    .populate('proposalId')
    .sort({ createdAt: -1 })
    .lean();

  // Transform for the frontend
  const result = bookings.map((b: Record<string, unknown>) => ({
    _id: String(b._id),
    status: b.status,
    totalAmount: b.totalAmount,
    currency: b.currency,
    createdAt: b.createdAt,
    event: b.eventId
      ? {
          eventType: (b.eventId as Record<string, unknown>).eventType,
          date: (b.eventId as Record<string, unknown>).date,
          guests: (b.eventId as Record<string, unknown>).guests,
          location: (b.eventId as Record<string, unknown>).location,
        }
      : null,
    proposal: b.proposalId
      ? {
          title: (b.proposalId as Record<string, unknown>).title,
          price: (b.proposalId as Record<string, unknown>).price,
        }
      : null,
  }));

  return NextResponse.json({ bookings: result });
}
