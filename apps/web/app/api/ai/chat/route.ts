import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { getSDK } from '@/lib/sdk';
import { createAllTools, systemPrompt } from '@proposales/ai';
import { getSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { saveMessages, type StoredMessage } from '@/lib/chat-store';

export const maxDuration = 60;

export async function POST(request: Request) {
  // Auth check
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: { message: 'Authentication required' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Rate limit (stricter for AI: 20/min)
  const rateResult = await checkRateLimit(`ai:${session}`);
  if (!rateResult.success) {
    return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages, conversationId } = await request.json();
  const sdk = getSDK();
  const tools = createAllTools(sdk);

  const result = streamText({
    model: openai('gpt-4o'),
    system: systemPrompt,
    messages,
    tools,
    maxSteps: 10,
    async onFinish({ response }) {
      // Persist messages to Redis if conversationId provided
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
        } catch {
          // Non-critical — don't fail the response
        }
      }
    },
  });

  return result.toDataStreamResponse();
}
