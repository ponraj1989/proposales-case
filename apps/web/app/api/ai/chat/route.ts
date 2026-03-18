import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { getSDK } from '@/lib/sdk';
import { createAllTools, systemPrompt } from '@proposales/ai';
import { getSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { saveMessages, type StoredMessage } from '@/lib/chat-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('ai:chat');

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.vercel.ai/v1',
});

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    log.warn('Unauthenticated AI chat attempt');
    return new Response(JSON.stringify({ error: { message: 'Authentication required' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rateResult = await checkRateLimit(`ai:${session}`);
  if (!rateResult.success) {
    log.warn('AI rate limit exceeded', { session });
    return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { messages, conversationId } = await request.json();
    log.info('AI chat request', { conversationId, messageCount: messages?.length });

    const sdk = getSDK();
    const tools = createAllTools(sdk);

    const result = streamText({
      model: openai('openai/gpt-5.2'),
      system: systemPrompt,
      messages,
      tools,
      maxSteps: 10,
      async onFinish({ response }) {
        log.info('AI chat completed', { conversationId, responseMessages: response.messages.length });
        if (conversationId) {
          try {
            const allMessages: StoredMessage[] = [
              ...messages.map((m: { id?: string; role: string; content: string }) => ({
                id: m.id ?? crypto.randomUUID(),
                role: m.role,
                content: m.content,
                createdAt: Date.now(),
              })),
              ...response.messages.map((m) => ({
                id: m.id ?? crypto.randomUUID(),
                role: m.role,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                createdAt: Date.now(),
              })),
            ];
            await saveMessages(conversationId, allMessages);
            log.debug('Messages saved to Redis', { conversationId });
          } catch (err) {
            log.error('Failed to save messages', { conversationId, error: err instanceof Error ? err.message : String(err) });
          }
        }
      },
    });

    return result.toDataStreamResponse();
  } catch (err) {
    log.error('AI chat error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return new Response(JSON.stringify({ error: { message: 'AI processing failed' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
