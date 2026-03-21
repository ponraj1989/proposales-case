import { NextResponse } from 'next/server';
import { getUserRole } from '@/lib/auth';
import { listActivityFeed } from '@/lib/activity-feed';

export async function GET() {
  const role = await getUserRole();
  if (!role) {
    return NextResponse.json({ error: { message: 'Authentication required' } }, { status: 401 });
  }

  const events = await listActivityFeed(50);
  return NextResponse.json({ data: events });
}
