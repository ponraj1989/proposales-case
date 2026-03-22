import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getConversation,
  getMessages,
  saveMessages,
  deleteConversation,
  updateConversationTitle,
} from '@/lib/chat-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:conversations:[id]');

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });

  const conversation = await getConversation(id);
  if (!conversation || conversation.userId !== session)
    return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });

  const messages = await getMessages(id);
  return NextResponse.json({ data: { ...conversation, messages } });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });

  const conversation = await getConversation(id);
  if (!conversation || conversation.userId !== session)
    return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });

  const body = await request.json();

  if (body.title) {
    await updateConversationTitle(id, body.title);
  }

  if (body.messages) {
    await saveMessages(id, body.messages);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });

  const conversation = await getConversation(id);
  if (!conversation || conversation.userId !== session)
    return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });

  await deleteConversation(id, session);
  return NextResponse.json({ success: true });
}
