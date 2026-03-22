import { NextResponse } from 'next/server';
import { getSession, getUserId, getUserRole } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import { Event } from '@/lib/models';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { message: 'Authentication required' } }, { status: 401 });
  }

  const [userId, role] = await Promise.all([getUserId(), getUserRole()]);
  if (!userId) {
    return NextResponse.json({ events: [] });
  }

  await connectDB();

  // Sales can see all events, customers see only their own
  const filter = role === 'sales' ? {} : { userId };
  const events = await Event.find(filter)
    .populate('userId', 'name email role')
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ events });
}
