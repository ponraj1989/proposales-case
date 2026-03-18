import { getRedis } from './redis';

// ─── Types ───

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolInvocations?: unknown[];
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Key helpers ───

const CONV_KEY = (id: string) => `conv:${id}`;
const MSGS_KEY = (id: string) => `msgs:${id}`;
const USER_LIST_KEY = (userId: string) => `user_convs:${userId}`;

// ─── Conversations ───

export async function createConversation(
  userId: string,
  title: string,
): Promise<Conversation> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const conv: Conversation = { id, title, userId, createdAt: now, updatedAt: now };

  const redis = getRedis();
  if (redis) {
    await redis.set(CONV_KEY(id), JSON.stringify(conv));
    await redis.lpush(USER_LIST_KEY(userId), id);
    await redis.ltrim(USER_LIST_KEY(userId), 0, 99);
  }

  return conv;
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const redis = getRedis();
  if (!redis) return [];

  const ids = await redis.lrange(USER_LIST_KEY(userId), 0, 49);
  if (!ids || ids.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const id of ids) pipeline.get(CONV_KEY(id));
  const results = await pipeline.exec();

  return (results ?? [])
    .map(([err, val]) => {
      if (err || !val) return null;
      return typeof val === 'string' ? JSON.parse(val) : null;
    })
    .filter((c): c is Conversation => c !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(CONV_KEY(id));
  if (!raw) return null;
  return JSON.parse(raw) as Conversation;
}

export async function deleteConversation(
  id: string,
  userId: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(CONV_KEY(id), MSGS_KEY(id));
  await redis.lrem(USER_LIST_KEY(userId), 0, id);
}

export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const conv = await getConversation(id);
  if (!conv) return;
  conv.title = title;
  conv.updatedAt = Date.now();
  await redis.set(CONV_KEY(id), JSON.stringify(conv));
}

// ─── Messages ───

export async function saveMessages(
  conversationId: string,
  messages: StoredMessage[],
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(MSGS_KEY(conversationId), JSON.stringify(messages));
  const conv = await getConversation(conversationId);
  if (conv) {
    conv.updatedAt = Date.now();
    await redis.set(CONV_KEY(conversationId), JSON.stringify(conv));
  }
}

export async function getMessages(conversationId: string): Promise<StoredMessage[]> {
  const redis = getRedis();
  if (!redis) return [];
  const raw = await redis.get(MSGS_KEY(conversationId));
  if (!raw) return [];
  return JSON.parse(raw) as StoredMessage[];
}
