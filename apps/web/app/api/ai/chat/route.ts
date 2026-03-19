import { gateway, streamText, stepCountIs, convertToModelMessages } from 'ai';
import { getSDK } from '@/lib/sdk';
import { createAllTools, systemPrompt } from '@proposales/ai';
import { getSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { saveMessages, type StoredMessage } from '@/lib/chat-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('ai:chat');

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
    const { messages: uiMessages, conversationId } = await request.json();
    log.info('AI chat request', { conversationId, messageCount: uiMessages?.length });

    const sdk = getSDK();
    const tools = createAllTools(sdk);

    const messages = await convertToModelMessages(uiMessages);

    const result = streamText({
      model: gateway(process.env.AI_MODEL || 'openai/gpt-4o'),
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(15),
      onError({ error }) {
        log.error('Stream error from AI provider', {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      },
      async onFinish({ text, steps }) {
        log.info('AI chat completed', { conversationId, steps: steps.length });
        if (conversationId) {
          try {
            const allMessages: StoredMessage[] = [
              ...uiMessages.map((m: { id?: string; role: string; parts?: { type: string; text?: string }[]; content?: string }) => ({
                id: m.id ?? crypto.randomUUID(),
                role: m.role,
                content: m.parts?.filter((p: { type: string }) => p.type === 'text').map((p: { text?: string }) => p.text).join('') ?? m.content ?? '',
                createdAt: Date.now(),
              })),
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: text,
                createdAt: Date.now(),
              },
            ];
            await saveMessages(conversationId, allMessages);
            log.debug('Messages saved to Redis', { conversationId });
          } catch (err) {
            log.error('Failed to save messages', { conversationId, error: err instanceof Error ? err.message : String(err) });
          }
        }
      },
    });

    return result.toUIMessageStreamResponse();
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
