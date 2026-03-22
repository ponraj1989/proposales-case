import { gateway, streamText, stepCountIs, convertToModelMessages } from 'ai';
import { getSDK } from '@/lib/sdk';
import { createAllTools, createCustomerTools, systemPrompt } from '@proposales/ai';
import { getSession, getUserRole, getUserEmail, getUserName } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { saveMessages, type StoredMessage } from '@/lib/chat-store';
import { sendEsignEmail } from '@/lib/email';
import { pushActivityFeedEvent } from '@/lib/activity-feed';
import connectDB from '@/lib/mongodb';
import { UserProposal } from '@/lib/models';
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
    const quickReplyContext = `\n[QUICK REPLIES]\n- When a short follow-up choice would help the user move faster, append a hidden quick reply block at the END of the assistant text using EXACTLY this format:\n[QUICK_REPLIES]\n- Label :: user message to send\n- Label :: user message to send\n[/QUICK_REPLIES]\n- Use at most 4 quick replies.\n- Use this for confirmations, option 1 vs option 2, add-ons like coffee break or breakfast, next-step choices, and simple yes/no decisions.\n- The visible assistant message must stay concise. Do NOT repeat the same choices in prose if you include quick replies.\n- Each quick reply message should be a complete user instruction, for example: Add coffee break and breakfast to the proposal.\n- Never mention the QUICK_REPLIES syntax to the user.`;
    const roleContext = role === 'sales'
      ? `\n\n[CONTEXT] User role: sales. You are a sales copilot for analytics and proposal operations. You can create dynamic visualizations (charts, dashboards, trends, comparisons) and also help draft/create/revise proposals.${companyContext}${userContext}${userNameContext}${langContext}${quickReplyContext}\n\n[SALES CHAT RULES]\n- You can do BOTH: (1) analytics/data visualization and (2) proposal generation/revision workflows.\n- For analytics requests, use queryProposalData + renderChart to deliver the requested visual output.\n- For proposal-generation requests, collect missing essentials (event type, date/time, guests, venue, budget, contact), then call generateProposalDraft.\n- Treat generateProposalDraft as a preview step; only create the actual proposal after user confirmation by calling acceptProposal with the draft_input from the latest draft.\n- If the user asks to revise price or package, use reviseProposalPricing and explain what changed.\n- You can search, view, patch, and analyze existing proposals as part of the same conversation.\n- You can check availability, view content, and use company data while preparing proposals.\n- ALWAYS use the company_id from [COMPANY ID] above when any tool requires it.`
      : `\n\n[CONTEXT] User role: customer (hotel guest). You are a fun, witty, and warm hotel concierge AI. ONLY help with: hotel rooms, boardrooms, conference rooms, banquet halls, event booking, facility information, and pricing. You can ONLY access THIS user's own proposals — NEVER discuss other customers' data, aggregate booking stats, revenue, pipeline metrics, or business intelligence. For ANY question not about the hotel, rooms, boardrooms, events, or facilities, reply ONLY with: "Ha! I appreciate the curiosity, but I'm your hotel concierge — my superpowers are limited to hotel rooms, event venues, amazing food, and making your stay unforgettable. 🏨 What can I help you with on that front?" If the user asks for charts, dashboards, analytics, or data visualization, reply: "I'm all about creating amazing experiences, not crunching numbers! 📊➡️🏨 Want me to help you plan an event or check out our rooms instead?" Do NOT answer general knowledge, coding, math, science, or any off-topic questions even if the user insists. Keep the tone funny, friendly, and warm — use emojis, light humor, and genuine enthusiasm.${companyContext}${userContext}${userNameContext}${langContext}${quickReplyContext}\n\n[IMPORTANT] All proposals are created and managed via the Proposales API — never store data locally.\n- You can ONLY help with THIS user's own proposals. Never access, discuss, or display other customers' proposals, bookings, or data.\n- ALWAYS use the company_id from [COMPANY ID] above when calling generateProposalDraft, reviseProposalPricing, or any tool that requires company_id.\n- When calling generateProposalDraft, it returns a preview card with item names but does NOT create the proposal in Proposales yet. The actual proposal is created only when the user clicks Accept and you call acceptProposal with the draft_input from the generateProposalDraft result.\n- When the user clicks Accept & Generate Proposal ([ACTION:ACCEPT_PROPOSAL]), call acceptProposal with the draft_input from the generateProposalDraft result to create the actual proposal. Then respond warmly: (1) Thank the guest genuinely for choosing our hotel — express excitement about their event, (2) Confirm the proposal is created and email will be sent, (3) Mention they can track on My Proposals page, (4) Proactively ask if they need anything else like airport pickup/transportation, special dining, extra decorations, guest rooms, or entertainment — use quick replies for these suggestions, (5) Close with a friendly, caring message. Make it feel personal and celebratory!\n- If acceptProposal fails or returns no proposal UUID, apologize briefly, explain it was a temporary hiccup, and say their setup is still available in this chat. Offer quick replies for \`Retry now :: Try generating the proposal again right now.\` and \`Edit details first :: I want to change a few details before trying again.\` If the user chooses retry, call acceptProposal again with the same latest draft_input from this conversation and do NOT ask them to re-enter details.\n- When showing proposal status, keep it simple: just say the status (Draft, Active, Accepted, etc.) and mention they can track on My Proposals. Do NOT say links are unavailable, do NOT mention e-sign instructions or emails.\n- Do NOT send any email automatically — the sales team handles sending the proposal to the user.\n- When the user rejects ([ACTION:REJECT_PROPOSAL]), do NOT immediately revise or create a new proposal. Instead: (1) Acknowledge warmly with compliments about their taste, (2) Ask WHY they're not happy using requestUserInput with options like 'Too expensive', 'Wrong venue', 'Date doesn't work', 'Need different services', 'Something else', (3) Based on their reason, offer two paths: a discount OR complimentary extras. Only revise the proposal AFTER the user explicitly chooses what they want.\n- When calling reviseProposal to update proposal details (notes, date, guests, venue, contact info, title, description, etc.), pass the proposal_uuid and an updates object with only the changed fields. This works before and after approval — even after e-sign.\n- Users can revise ANY of their OWN past proposals by quoting the reference ID (UUID) from the My Proposals page. When a user mentions a UUID or reference ID and wants to update their proposal, call reviseProposal with that UUID. Ask what they want to change first.\n- If the user asks to modify/revise a booking but does NOT provide a UUID, call listMyProposals first, show their bookings (booking number = UUID), and ask which booking number to modify. Then call reviseProposal.\n- Use the user email from [USER EMAIL] as the recipient email.\n- When the customer asks about available rooms, room types, facilities, what you offer, or pricing, you MUST call listContent to get the real catalog data from the Proposales Content API. Show the actual names, descriptions, and prices returned by the API. NEVER make up room names or prices.`;

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
      async onStepFinish({ toolResults }) {
        // Push activity feed events when AI tools complete proposal actions
        if (!toolResults || toolResults.length === 0) return;
        for (const tr of toolResults) {
          try {
            // AI SDK v6: tool results have `output` (not `result`)
            const entry = tr as unknown as { toolName?: string; output?: Record<string, unknown>; result?: Record<string, unknown> };
            const r = entry.output ?? entry.result;
            if (!r || typeof r !== 'object') continue;
            const toolName = entry.toolName;

            if (toolName === 'generateProposalDraft' && r.type === 'proposal_draft') {
              // Draft preview only — no proposal created yet, no activity feed, no UserProposal save.
              // The actual proposal is created when the user accepts via acceptProposal.
            } else if (toolName === 'acceptProposal' && r.type === 'proposal_status') {
              const proposal = r.proposal as { title?: string; totalAmount?: number; currency?: string; proposalUuid?: string; status?: string; venue_type?: string } | undefined;
              const rec = r.recipient as { name?: string; email?: string } | undefined;
              const bookingDetails = r.booking_details as { event_date?: string; guests?: number } | undefined;
              const fmtAmt = (proposal?.totalAmount ?? 0) > 0
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: proposal?.currency || 'USD' }).format(proposal!.totalAmount!)
                : '';

              // Activity feed: Proposal Created
              await pushActivityFeedEvent({
                type: 'created',
                title: 'Proposal Created',
                description: `New proposal "${proposal?.title || 'Proposal'}" for ${rec?.name || userName || 'customer'}${fmtAmt ? ` — ${fmtAmt}` : ''}`,
                proposalUuid: proposal?.proposalUuid,
                proposalTitle: proposal?.title,
                recipientName: rec?.name || userName || userEmail || undefined,
                amount: proposal?.totalAmount,
                currency: proposal?.currency,
              });

              // Save to UserProposal so "My Proposals" page shows it
              const saveEmail = userEmail || rec?.email;
              if (proposal?.proposalUuid && saveEmail) {
                try {
                  await connectDB();
                  await UserProposal.findOneAndUpdate(
                    { proposalUuid: proposal.proposalUuid },
                    {
                      userEmail: saveEmail.toLowerCase(),
                      proposalUuid: proposal.proposalUuid,
                      proposalTitle: proposal.title || 'Untitled Proposal',
                      proposalUrl: proposal.proposalUuid ? undefined : undefined,
                      status: proposal.status || 'active',
                      totalAmountCents: Math.round((proposal.totalAmount || 0) * 100),
                      currency: proposal.currency || 'EUR',
                      venueType: (proposal.venue_type as string) || undefined,
                      eventDate: bookingDetails?.event_date || undefined,
                      guests: bookingDetails?.guests || undefined,
                    },
                    { upsert: true, new: true },
                  );
                } catch (err) {
                  console.error('Failed to save UserProposal on accept:', err instanceof Error ? err.message : String(err));
                }
              }
            } else if (toolName === 'reviseProposalPricing' && r.type === 'proposal_draft') {
              const rec = r.recipient as { name?: string } | undefined;
              const discount = r.discount_applied as number | undefined;
              const fmtAmt = (r.total as number) > 0
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: (r.currency as string) || 'USD' }).format(r.total as number)
                : '';
              await pushActivityFeedEvent({
                type: 'updated',
                title: 'Proposal Revised',
                description: `"${r.title}" revised${discount ? ` (${discount}% off)` : ''} for ${rec?.name || 'customer'}${fmtAmt ? ` — ${fmtAmt}` : ''}`,
                proposalUuid: r.proposalUuid as string | undefined,
                proposalTitle: r.title as string,
                recipientName: rec?.name,
                amount: r.total as number,
                currency: r.currency as string,
              });

              // Update UserProposal with revised pricing
              const revRecEmail = (r.recipient as { email?: string })?.email;
              const revSaveEmail = userEmail || revRecEmail;
              if (r.proposalUuid && revSaveEmail) {
                try {
                  await connectDB();
                  await UserProposal.findOneAndUpdate(
                    { proposalUuid: r.proposalUuid as string },
                    {
                      userEmail: revSaveEmail.toLowerCase(),
                      proposalUuid: r.proposalUuid as string,
                      proposalTitle: (r.title as string) || 'Untitled Proposal',
                      status: 'negotiating',
                      totalAmountCents: Math.round((r.total as number) * 100),
                      currency: (r.currency as string) || 'EUR',
                    },
                    { upsert: true },
                  );
                } catch (err) {
                  console.error('Failed to update UserProposal on pricing revision:', err instanceof Error ? err.message : String(err));
                }
              }
            } else if (toolName === 'reviseProposal' && r.type === 'proposal_revised') {
              await pushActivityFeedEvent({
                type: 'updated',
                title: 'Proposal Details Revised',
                description: `"${r.title || 'Proposal'}" details updated${userName ? ` by ${userName}` : ''}`,
                proposalUuid: r.proposalUuid as string | undefined,
                proposalTitle: r.title as string,
              });

              // Update UserProposal with revised fields
              if (r.proposalUuid) {
                try {
                  await connectDB();
                  const updateFields: Record<string, unknown> = {};
                  if (r.venue_type) updateFields.venueType = r.venue_type;
                  if (r.event_date) updateFields.eventDate = r.event_date;
                  if (r.guests) updateFields.guests = r.guests;
                  if (r.title) updateFields.proposalTitle = r.title;
                  if (userEmail) updateFields.userEmail = userEmail.toLowerCase();
                  if (Object.keys(updateFields).length > 0) {
                    await UserProposal.findOneAndUpdate(
                      { proposalUuid: r.proposalUuid as string },
                      updateFields,
                    );
                  }
                } catch (err) {
                  console.error('Failed to update UserProposal on revision:', err instanceof Error ? err.message : String(err));
                }
              }
            }
          } catch {
            // Non-critical — don't let feed errors break the chat
          }
        }
      },
      async onFinish({ text, steps }) {
        // All proposal data is managed via the Proposales API (create/patch/search)
        // No direct MongoDB writes for events, proposals, or bookings

        // Save messages to Redis — preserve parts for rich content on reload
        if (conversationId) {
          try {
            // Preserve incoming messages with their parts (tool invocations, etc.)
            const incomingMessages: StoredMessage[] = uiMessages.map(
              (m: { id?: string; role: string; parts?: unknown[]; content?: string }) => {
                const parts = Array.isArray(m.parts) ? m.parts : [];
                const textContent = parts.length > 0
                  ? parts
                    .filter((p) => (p as { type?: string }).type === 'text')
                    .map((p) => (p as { text?: string }).text ?? '')
                    .join('')
                  : (m.content ?? '');
                return {
                  id: m.id ?? crypto.randomUUID(),
                  role: m.role,
                  content: textContent,
                  parts: parts.length > 0 ? parts : undefined,
                  createdAt: Date.now(),
                };
              },
            );

            // Build assistant parts from steps (tool calls + text)
            const assistantParts: unknown[] = [];
            if (Array.isArray(steps)) {
              for (const step of steps) {
                const s = step as { toolCalls?: unknown[]; toolResults?: unknown[]; text?: string };
                if (Array.isArray(s.toolCalls)) {
                  for (let i = 0; i < s.toolCalls.length; i++) {
                    const tc = s.toolCalls[i] as { toolCallId?: string; toolName?: string; args?: unknown };
                    const tr = Array.isArray(s.toolResults) ? s.toolResults[i] as { result?: unknown } : undefined;
                    assistantParts.push({
                      type: 'tool-invocation',
                      toolName: tc.toolName,
                      toolCallId: tc.toolCallId,
                      state: 'result',
                      input: tc.args,
                      output: tr?.result,
                    });
                  }
                }
                if (s.text) {
                  assistantParts.push({ type: 'text', text: s.text });
                }
              }
            }
            if (assistantParts.length === 0 && text) {
              assistantParts.push({ type: 'text', text });
            }

            const allMessages: StoredMessage[] = [
              ...incomingMessages,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: text,
                parts: assistantParts,
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
