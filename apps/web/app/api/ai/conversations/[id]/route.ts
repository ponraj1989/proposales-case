import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getConversation,
  getMessages,
  saveMessages,
  deleteConversation,
  updateConversationTitle,
} from '@/lib/chat-store';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });

  const conversation = await getConversation(params.id);
  if (!conversation || conversation.userId !== session)
    return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });

  const messages = await getMessages(params.id);
  return NextResponse.json({ data: { ...conversation, messages } });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });

  const body = await request.json();

  if (body.title) {
    await updateConversationTitle(params.id, body.title);
  }

  if (body.messages) {
    await saveMessages(params.id, body.messages);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });

  await deleteConversation(params.id, session);
  return NextResponse.json({ success: true });
}
