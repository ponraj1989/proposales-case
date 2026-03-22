import { NextResponse } from 'next/server';
import { getSession, getUserRole } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import { EmailLog } from '@/lib/models';

// GET /api/email-logs?proposal_uuid=... — fetch email logs for a proposal (sales only)
export async function GET(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
  }
  const role = await getUserRole();
  if (role !== 'sales') {
    return NextResponse.json({ error: { message: 'Forbidden' } }, { status: 403 });
  }

  await connectDB();

  const url = new URL(request.url);
  const proposalUuid = url.searchParams.get('proposal_uuid');

  const query = proposalUuid ? { proposalUuid } : {};
  const logs = await EmailLog.find(query)
    .sort({ sentAt: -1 })
    .limit(100)
    .lean();

  return NextResponse.json({ data: logs });
}

// POST /api/email-logs — manually log an email send (sales only)
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
  }
  const role = await getUserRole();
  if (role !== 'sales') {
    return NextResponse.json({ error: { message: 'Forbidden' } }, { status: 403 });
  }

  const body = await request.json();
  const { proposalUuid, to, recipientName, subject, type } = body;
  if (!proposalUuid || !to || !type) {
    return NextResponse.json(
      { error: { message: 'proposalUuid, to, and type are required' } },
      { status: 400 },
    );
  }

  await connectDB();
  const log = await EmailLog.create({
    proposalUuid,
    to,
    recipientName: recipientName || '',
    subject: subject || '',
    type,
    status: 'sent',
    sentAt: new Date(),
    sentBy: session,
  });

  return NextResponse.json({ data: log }, { status: 201 });
}
