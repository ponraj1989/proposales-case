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
    const { title, eventType, guests, context, mode, date, contentItems } = await request.json();

    // ─── Mode: pricing — AI suggests pricing strategy ───
    if (mode === 'pricing') {
      const now = new Date();
      const eventDate = date ? new Date(date) : now;
      const monthName = eventDate.toLocaleString('en-US', { month: 'long' });
      const dayOfWeek = eventDate.toLocaleString('en-US', { weekday: 'long' });

      const itemsList = Array.isArray(contentItems)
        ? contentItems.map((c: { title: string; quantity: number }) => `- ${c.title} ×${c.quantity}`).join('\n')
        : 'No items selected yet';

      const pricingPrompt = `You are a hotel revenue management expert. Suggest pricing strategy for a proposal.

Event: ${eventType || 'General event'}
Date: ${monthName}, ${dayOfWeek}${date ? ` (${date})` : ''}
Guests: ${guests || 'TBD'}
${title ? `Proposal: ${title}` : ''}

Selected items:
${itemsList}

Provide a JSON response with:
1. "strategy": one of "premium", "standard", "value" — recommended pricing tier
2. "seasonMultiplier": number between 0.85 and 1.25 — season adjustment factor
3. "reasoning": 2-3 sentences explaining why
4. "tips": array of 3-4 short actionable tips for the sales person
5. "suggestedDiscount": number 0-20, recommended initial discount to offer if client negotiates

Return ONLY valid JSON, no markdown fences or extra text.`;

      const result = await generateText({
        model: gateway(process.env.AI_MODEL || 'openai/gpt-4o'),
        prompt: pricingPrompt,
      });

      try {
        const cleaned = result.text.replace(/```json\s*|```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return new Response(JSON.stringify({ pricing: parsed }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch {
        return new Response(JSON.stringify({ pricing: { strategy: 'standard', seasonMultiplier: 1, reasoning: result.text, tips: [], suggestedDiscount: 5 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── Mode: extract — Parse free-text into structured event data ───
    if (mode === 'extract') {
      const extractPrompt = `You are an AI assistant that extracts structured event details from a free-text proposal request.

User message: "${context}"

Extract the following fields from the text. If a field is not mentioned, use null.
Return ONLY valid JSON with these keys:
- "event_type": string or null (e.g. "conference", "wedding", "meeting", "dinner", "seminar", "party", "accommodation")
- "event_date": string (ISO date) or null
- "guests": number or null
- "room": string or null
- "time_slot": string or null ("morning", "afternoon", "evening", "full-day")
- "contact_name": string or null
- "contact_email": string or null
- "contact_company": string or null
- "notes": string or null (any extra requirements not captured above)

Return ONLY valid JSON, no markdown fences or extra text.`;

      const extractResult = await generateText({
        model: gateway(process.env.AI_MODEL || 'openai/gpt-4o'),
        prompt: extractPrompt,
      });

      try {
        const cleaned = extractResult.text.replace(/```json\s*|```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return new Response(JSON.stringify({ extracted: parsed }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch {
        return new Response(JSON.stringify({ extracted: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── Default mode: description generation ───
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
