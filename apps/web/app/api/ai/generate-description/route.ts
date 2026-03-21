import { gateway, generateText } from 'ai';
import { getSession, getUserRole } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';

export const maxDuration = 30;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const role = await getUserRole();
  if (role !== 'sales') {
    return new Response(JSON.stringify({ error: 'Sales access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rateResult = await checkRateLimit(`ai-desc:${session}`);
  if (!rateResult.success) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { title, eventType, guests, context } = await request.json();

    const prompt = `You are a professional hotel proposal writer. Generate a compelling, elegant hotel/venue description for a proposal.

${title ? `Proposal Title: ${title}` : ''}
${eventType ? `Event Type: ${eventType}` : ''}
${guests ? `Expected Guests: ${guests}` : ''}
${context ? `Additional Context: ${context}` : ''}

Write a rich, professional description (2-3 paragraphs) in markdown that:
- Opens with a warm, personalized greeting about the venue/hotel
- Highlights relevant facilities and amenities for the event type
- Mentions key services included (catering, AV, accommodation, etc.)
- Closes with a confident, inviting call to action
- Uses elegant, professional language suitable for a hotel proposal
- If an event type is mentioned, tailor the description to that specific event

Return ONLY the description text in markdown, no extra commentary.`;

    const result = await generateText({
      model: gateway(process.env.AI_MODEL || 'openai/gpt-4o'),
      prompt,
    });

    return new Response(JSON.stringify({ description: result.text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Generate description error', err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: 'Failed to generate description' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
