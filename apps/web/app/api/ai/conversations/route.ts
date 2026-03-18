import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  createConversation,
  listConversations,
} from '@/lib/chat-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:conversations');

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });

  try {
    const conversations = await listConversations(session);
    log.debug('Listed conversations', { count: conversations.length });
    return NextResponse.json({ data: conversations });
  } catch (err) {
    log.error('Failed to list conversations', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: { message: 'Failed to list conversations' } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });

  try {
    const { title } = await request.json();
    const conversation = await createConversation(
      session,
      typeof title === 'string' && title.trim() ? title.trim() : 'New Chat',
    );
    log.info('Conversation created', { id: conversation.id });
    return NextResponse.json({ data: conversation });
  } catch (err) {
    log.error('Failed to create conversation', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: { message: 'Failed to create conversation' } }, { status: 500 });
  }
}
