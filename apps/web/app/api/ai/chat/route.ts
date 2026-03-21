import { gateway, streamText, stepCountIs, convertToModelMessages } from 'ai';
import { getSDK } from '@/lib/sdk';
import { createAllTools, createCustomerTools, systemPrompt } from '@proposales/ai';
import { getSession, getUserRole, getUserEmail, getUserName } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { saveMessages, type StoredMessage } from '@/lib/chat-store';
import { sendEsignEmail } from '@/lib/email';
import * as pmsDb from '@/lib/pms-db';

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: { message: 'Authentication required' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rateResult = await checkRateLimit(`ai:${session}`);
  if (!rateResult.success) {
    return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { messages: uiMessages, conversationId, language } = await request.json();
    const [role, userEmail, userName] = await Promise.all([
      getUserRole(),
      getUserEmail(),
      getUserName(),
    ]);

    const sdk = getSDK();
    const userInfo = { email: userEmail || undefined, name: userName || undefined };

    // Fetch the default company from Proposales API
    let defaultCompanyId: number | undefined;
    try {
      const companiesResult = await sdk.companies.list();
      const companies = (companiesResult as { data?: { id: number }[] })?.data;
      if (companies && companies.length > 0) {
        defaultCompanyId = companies[0].id;
      }
    } catch { /* ignore */ }

    // Choose tools based on role — both roles now get SDK + user info + email sender + DB-backed PMS
    let tools;
    if (role === 'sales') {
      tools = createAllTools(sdk, userInfo, sendEsignEmail, pmsDb);
    } else {
      tools = createCustomerTools(sdk, userInfo, sendEsignEmail, pmsDb);
    }

    // Add role context to system prompt
    const companyContext = defaultCompanyId ? `\n[COMPANY ID] ${defaultCompanyId}` : '';
    const userContext = userEmail ? `\n[USER EMAIL] ${userEmail}` : '';
    const userNameContext = userName ? `\n[USER NAME] ${userName}` : '';
    const langContext = language && language !== 'en' ? `\n[LANGUAGE] Respond in ${language}. Use this language for all conversation, but keep tool parameters in English.` : '';
    const roleContext = role === 'sales'
      ? `\n\n[CONTEXT] User role: sales. You have full access to all Proposales tools and data. You can create any type of dynamic visualization the user requests — charts, graphs, dashboards, comparisons, trends, custom metrics. Use queryProposalData + renderChart to fulfill ANY visualization request dynamically.${companyContext}${userContext}${userNameContext}${langContext}`
      : `\n\n[CONTEXT] User role: customer (hotel guest). You are STRICTLY a hotel concierge. ONLY help with: hotel rooms, boardrooms, conference rooms, banquet halls, event booking, facility information, and pricing. For ANY question not about the hotel, rooms, boardrooms, events, or facilities, reply ONLY with: "I'm your hotel concierge — I can only help with hotel facilities, room bookings, event venues, and pricing. How can I assist you with those?" Do NOT answer general knowledge, coding, math, science, or any off-topic questions even if the user insists.${companyContext}${userContext}${userNameContext}${langContext}\n\n[IMPORTANT] All proposals are created and managed via the Proposales API — never store data locally.\n- ALWAYS use the company_id from [COMPANY ID] above when calling generateProposalDraft, reviseProposalPricing, or any tool that requires company_id.\n- When calling generateProposalDraft, it automatically creates the proposal in Proposales and returns proposalUuid and proposalUrl in the result.\n- When calling reviseProposalPricing during negotiation, pass the proposal_uuid from the draft. It uses PATCH to update the SAME proposal with discount metadata — no new proposal is created. The UUID and e-sign URL stay the same.\n- When calling acceptProposal, pass the proposalUuid and proposalUrl from the draft. It patches the proposal status to "accepted" via the API.\n- After acceptance, ALWAYS share the e-sign link (proposalUrl) with the customer so they can review and sign the proposal.\n- The e-sign link format is https://esign.proposales.com/v/{proposalUuid}\n- Use the user email from [USER EMAIL] as the recipient email.\n- When the customer asks about available rooms, room types, facilities, what you offer, or pricing, you MUST call listContent to get the real catalog data from the Proposales Content API. Show the actual names, descriptions, and prices returned by the API. NEVER make up room names or prices.`;

    const messages = await convertToModelMessages(uiMessages);

    const result = streamText({
      model: gateway(process.env.AI_MODEL || 'openai/gpt-4o'),
      system: systemPrompt + roleContext,
      messages,
      tools,
      stopWhen: stepCountIs(15),
      onError({ error }) {
        console.error('Stream error', error instanceof Error ? error.message : String(error));
      },
      async onFinish({ text }) {
        // All proposal data is managed via the Proposales API (create/patch/search)
        // No direct MongoDB writes for events, proposals, or bookings

        // Save messages to Redis
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
          } catch { /* ignore */ }
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error('AI chat error', err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: { message: 'AI processing failed' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
