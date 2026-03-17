import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  createConversation,
  listConversations,
} from '@/lib/chat-store';

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });

  const conversations = await listConversations(session);
  return NextResponse.json({ data: conversations });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });

  const { title } = await request.json();
  const conversation = await createConversation(
    session,
    typeof title === 'string' && title.trim() ? title.trim() : 'New Chat',
  );
  return NextResponse.json({ data: conversation });
}
