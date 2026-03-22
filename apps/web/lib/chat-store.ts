import { getRedis } from './redis';
import connectDB from './mongodb';
import { Conversation as ConversationModel } from './models';

// ─── Types ───

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: unknown[];
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

// ─── Key helpers (Redis cache) ───

const CONV_KEY = (id: string) => `conv:${id}`;
const MSGS_KEY = (id: string) => `msgs:${id}`;
const USER_LIST_KEY = (userId: string) => `user_convs:${userId}`;

// ─── Helpers ───

function docToConversation(doc: {
  conversationId: string;
  userId: string;
  title: string;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
}): Conversation {
  return {
    id: doc.conversationId,
    title: doc.title,
    userId: doc.userId,
    createdAt: new Date(doc.createdAt).getTime(),
    updatedAt: new Date(doc.updatedAt).getTime(),
  };
}

// ─── Conversations ───

export async function createConversation(
  userId: string,
  title: string,
): Promise<Conversation> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const conv: Conversation = { id, title, userId, createdAt: now, updatedAt: now };

  // MongoDB (source of truth)
  await connectDB();
  await ConversationModel.create({
    conversationId: id,
    userId,
    title,
    messages: [],
  });

  // Redis (cache)
  const redis = getRedis();
  if (redis) {
    await redis.set(CONV_KEY(id), JSON.stringify(conv));
    await redis.lpush(USER_LIST_KEY(userId), id);
    await redis.ltrim(USER_LIST_KEY(userId), 0, 99);
  }

  return conv;
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  // Try Redis cache first
  const redis = getRedis();
  if (redis) {
    const ids = await redis.lrange(USER_LIST_KEY(userId), 0, 49);
    if (ids && ids.length > 0) {
      const pipeline = redis.pipeline();
      for (const id of ids) pipeline.get(CONV_KEY(id));
      const results = await pipeline.exec();
      const cached = (results ?? [])
        .map(([err, val]) => {
          if (err || !val) return null;
          return typeof val === 'string' ? JSON.parse(val) : null;
        })
        .filter((c): c is Conversation => c !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      if (cached.length > 0) return cached;
    }
  }

  // Fallback to MongoDB
  await connectDB();
  const docs = await ConversationModel.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  const conversations = docs.map((doc) => docToConversation(doc as unknown as Parameters<typeof docToConversation>[0]));

  // Repopulate Redis cache
  if (redis && conversations.length > 0) {
    const pipeline = redis.pipeline();
    for (const conv of conversations) {
      pipeline.set(CONV_KEY(conv.id), JSON.stringify(conv));
    }
    pipeline.del(USER_LIST_KEY(userId));
    for (const conv of conversations) {
      pipeline.rpush(USER_LIST_KEY(userId), conv.id);
    }
    await pipeline.exec();
  }

  return conversations;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  // Try Redis cache
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(CONV_KEY(id));
    if (raw) return JSON.parse(raw) as Conversation;
  }

  // Fallback to MongoDB
  await connectDB();
  const doc = await ConversationModel.findOne({ conversationId: id }).lean();
  if (!doc) return null;

  const conv = docToConversation(doc as unknown as Parameters<typeof docToConversation>[0]);

  // Repopulate Redis cache
  if (redis) {
    await redis.set(CONV_KEY(id), JSON.stringify(conv));
  }

  return conv;
}

export async function deleteConversation(
  id: string,
  userId: string,
): Promise<void> {
  // MongoDB
  await connectDB();
  await ConversationModel.deleteOne({ conversationId: id });

  // Redis
  const redis = getRedis();
  if (redis) {
    await redis.del(CONV_KEY(id), MSGS_KEY(id));
    await redis.lrem(USER_LIST_KEY(userId), 0, id);
  }
}

export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<void> {
  // MongoDB
  await connectDB();
  await ConversationModel.findOneAndUpdate(
    { conversationId: id },
    { title },
  );

  // Redis
  const redis = getRedis();
  if (redis) {
    const conv = await getConversation(id);
    if (conv) {
      conv.title = title;
      conv.updatedAt = Date.now();
      await redis.set(CONV_KEY(id), JSON.stringify(conv));
    }
  }
}

// ─── Messages ───

export async function saveMessages(
  conversationId: string,
  messages: StoredMessage[],
): Promise<void> {
  // MongoDB (source of truth)
  await connectDB();
  await ConversationModel.findOneAndUpdate(
    { conversationId },
    {
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        parts: m.parts,
        toolInvocations: m.toolInvocations,
        createdAt: m.createdAt,
      })),
    },
  );

  // Redis (cache)
  const redis = getRedis();
  if (redis) {
    await redis.set(MSGS_KEY(conversationId), JSON.stringify(messages));
    // Update conversation updatedAt
    const conv = await getConversation(conversationId);
    if (conv) {
      conv.updatedAt = Date.now();
      await redis.set(CONV_KEY(conversationId), JSON.stringify(conv));
    }
  }
}

export async function getMessages(conversationId: string): Promise<StoredMessage[]> {
  // Try Redis cache
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(MSGS_KEY(conversationId));
    if (raw) return JSON.parse(raw) as StoredMessage[];
  }

  // Fallback to MongoDB
  await connectDB();
  const doc = await ConversationModel.findOne({ conversationId }).lean();
  if (!doc || !doc.messages) return [];

  const messages: StoredMessage[] = (doc.messages as unknown as StoredMessage[]).map((m) => ({
    id: m.id,
    role: m.role as StoredMessage['role'],
    content: m.content ?? '',
    parts: m.parts,
    toolInvocations: m.toolInvocations,
    createdAt: m.createdAt ?? Date.now(),
  }));

  // Repopulate Redis cache
  if (redis && messages.length > 0) {
    await redis.set(MSGS_KEY(conversationId), JSON.stringify(messages));
  }

  return messages;
}
