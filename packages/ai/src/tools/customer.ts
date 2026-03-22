import { tool } from 'ai';
import { z } from 'zod';
import type { ProposalesSDK, Proposal } from '@proposales/api-client';
import { holdSpace } from './pms';

/**
 * Tool: requestUserInput
 * Presents interactive form fields to the user instead of asking plain text questions.
 * The AI calls this when it needs structured information (date, guest count, event type, etc.)
 * and the frontend renders an inline form card with dropdowns, date pickers, and buttons.
 */
export function createRequestUserInputTool() {
  return tool({
    description:
      'Present interactive input fields to collect missing information from the user. ' +
      'Instead of asking a text question, call this tool with field definitions and the frontend ' +
      'will render a beautiful inline form card with appropriate controls (date picker, dropdown, ' +
      'number stepper, toggles, text input). The user fills in the fields and submits — their ' +
      'answers arrive as the next message. Use this WHENEVER you need to collect event details, ' +
      'preferences, or any structured data from the user. Group related fields into a single call ' +
      '(e.g. event type + date + guests together). Maximum 6 fields per call.',
    inputSchema: z.object({
      title: z.string().describe('Short heading for the input card, e.g. "Event Details", "Guest Information"'),
      description: z.string().optional().describe('Brief helper text below the title'),
      fields: z.array(z.object({
        name: z.string().describe('Field identifier (camelCase), e.g. "eventType", "date", "guests"'),
        label: z.string().describe('Display label, e.g. "Event Type", "Date", "Number of Guests"'),
        type: z.enum(['select', 'date', 'number', 'text', 'toggle_group']).describe(
          'Input type: select=dropdown, date=date picker, number=number input, text=text input, toggle_group=multi-option icon buttons',
        ),
        required: z.boolean().optional().describe('Whether the field is required'),
        placeholder: z.string().optional().describe('Placeholder text'),
        options: z.array(z.object({
          value: z.string(),
          label: z.string(),
          icon: z.string().optional().describe('Emoji icon for toggle_group items'),
        })).optional().describe('Options for select or toggle_group fields'),
        min: z.number().optional().describe('Minimum value for number fields'),
        max: z.number().optional().describe('Maximum value for number fields'),
        default_value: z.string().optional().describe('Default value for the field'),
      })).min(1).max(6).describe('Array of field definitions'),
    }),
    execute: async (input) => {
      return {
        type: 'user_input_request' as const,
        title: input.title,
        description: input.description,
        fields: input.fields,
      };
    },
  });
}

/**
 * Tool: extractEventDetails
 * Extracts and returns structured event data from the conversation.
 * Data is used by the AI to inform proposal generation via the Proposales API.
 */
export function createExtractEventDetailsTool() {
  return tool({
    description:
      'Extract structured event booking details from the conversation. Call this when you have gathered enough info (at least event type, date, and guest count). Returns the structured event for display.',
    inputSchema: z.object({
      eventType: z.string().describe('Type of event: wedding, conference, dinner, meeting, party, etc.'),
      date: z.string().describe('Event date in YYYY-MM-DD format or descriptive string'),
      guests: z.number().describe('Number of guests/attendees'),
      location: z.string().optional().describe('Preferred location or venue'),
      budget: z.number().optional().describe('Budget in dollars'),
      time: z.string().optional().describe('Preferred time: morning, afternoon, evening, or specific time'),
      setupType: z.string().optional().describe('Setup style: theater, classroom, banquet, cocktail, boardroom, etc.'),
      notes: z.string().optional().describe('Additional requirements: food, AV, decorations, accommodation, etc.'),
    }),
    execute: async (input) => {
      // Return the structured data for AI context — no direct DB writes
      return {
        type: 'event_details' as const,
        event: {
          eventType: input.eventType,
          date: input.date,
          guests: input.guests,
          location: input.location || null,
          budget: input.budget || null,
          time: input.time || null,
          setupType: input.setupType || null,
          notes: input.notes || null,
        },
        message: `Event details captured: ${input.eventType} on ${input.date} for ${input.guests} guests${input.location ? ` at ${input.location}` : ''}.`,
      };
    },
  });
}

/** Callback type for sending e-sign emails (used by sales flow only) */
export type SendEsignEmailFn = (options: {
  to: string;
  recipientName: string;
  proposalTitle: string;
  totalAmount: string;
  esignUrl: string;
  proposalUuid?: string;
  sentBy?: string;
}) => Promise<{ sent: boolean; esignId?: string; esignUrl?: string }>;

/**
 * Tool: acceptProposal
 * Creates the actual proposal in the Proposales system when the user accepts the draft.
 * The proposal is NOT created during generateProposalDraft — only here on explicit accept.
 * Also holds the space for 7 days if space booking details are provided.
 */
export function createAcceptProposalTool(
  sdk?: ProposalesSDK,
  userInfo?: { email?: string; name?: string },
) {
  return tool({
    description:
      'Create and finalize a proposal in the Proposales system after the user accepts the draft. Call this ONLY when the user clicks Accept & Generate Proposal or explicitly confirms. Pass the draft_input from the generateProposalDraft result to create the actual proposal with real pricing. Returns the created proposal with UUID, URL, and finalized prices.',
    inputSchema: z.object({
      proposalTitle: z.string().describe('Title of the proposal from the draft'),
      currency: z.string().default('USD').describe('Currency code'),
      // Full draft creation params forwarded from generateProposalDraft
      draft_input: z.object({
        title: z.string(),
        description: z.string(),
        items: z.array(z.object({
          content_id: z.number(),
          quantity: z.number(),
        })).min(1),
        currency: z.string().optional(),
        recipient_name: z.string(),
        recipient_email: z.string(),
        recipient_company: z.string().optional().nullable(),
        recipient_phone: z.string().optional().nullable(),
        company_id: z.number(),
        language: z.string().optional(),
        notes: z.string().optional().nullable(),
        venue_type: z.string().optional().nullable(),
        invoicing_enabled: z.boolean().optional().nullable(),
        tax_options: z.object({
          mode: z.enum(['standard', 'simplified', 'tax-free', 'none']).optional(),
          tax_included: z.boolean().optional(),
          tax_label_key: z.string().optional(),
        }).optional().nullable(),
        background_image: z.object({ id: z.number(), uuid: z.string() }).optional().nullable(),
        background_video: z.object({ id: z.number(), uuid: z.string() }).optional().nullable(),
        attachments: z.array(z.object({ id: z.number(), uuid: z.string() })).optional().nullable(),
        space_id: z.string().optional().nullable(),
        event_date: z.string().optional().nullable(),
        time_slot_id: z.string().optional().nullable(),
        guests: z.number().optional().nullable(),
      }).describe('The draft_input object returned by generateProposalDraft — forward it here unchanged'),
    }),
    execute: async (input) => {
      const di = input.draft_input;
      const recipientEmail = di.recipient_email;
      const nameParts = (di.recipient_name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const blocks = di.items.map((item) => ({ content_id: item.content_id, quantity: item.quantity }));

      let proposalUuid: string | null = null;
      let proposalUrl: string | null = null;
      let resolvedItems: { name: string; description: string; quantity: number; unit_price: number; total: number; content_id: number }[] = [];
      let subtotal = 0;
      let tax = 0;
      let total = 0;

      if (sdk) {
        try {
          // Create the actual proposal in Proposales
          const apiResult = await sdk.proposals.create({
            company_id: di.company_id,
            language: di.language || 'en',
            title_md: di.title,
            description_md: di.description,
            creator_email: userInfo?.email,
            contact_email: recipientEmail,
            recipient: {
              first_name: firstName,
              last_name: lastName,
              email: recipientEmail,
              phone: di.recipient_phone || undefined,
              company_name: di.recipient_company || undefined,
            },
            blocks,
            data: {
              source: 'chat_assist',
              venue_type: di.venue_type ?? null,
              notes: di.notes ?? '',
              status: 'active',
              negotiation_round: 0,
              discount_applied: 0,
            },
            invoicing_enabled: di.invoicing_enabled || undefined,
            tax_options: di.tax_options || undefined,
            background_image: di.background_image || undefined,
            background_video: di.background_video || undefined,
            attachments: di.attachments || undefined,
          });

          proposalUuid = apiResult?.proposal?.uuid ?? null;

          // Fetch the created proposal to get real prices
          if (proposalUuid) {
            const fetchedResult = await sdk.proposals.get(proposalUuid);
            const fetched: Proposal = fetchedResult.data;
            proposalUrl = fetched.pdf_url ?? null;

            if (fetched.blocks?.length) {
              resolvedItems = fetched.blocks.map((block, idx) => {
                const qty = di.items[idx]?.quantity ?? block.quantity ?? 1;
                const unitPriceCents = block.unit_value_with_discount_with_tax ?? 0;
                const unitPrice = unitPriceCents / 100;
                return {
                  name: block.title ?? `Item ${idx + 1}`,
                  description: block.description ?? '',
                  quantity: qty,
                  unit_price: unitPrice,
                  total: Math.round(unitPrice * qty * 100) / 100,
                  content_id: di.items[idx]?.content_id,
                };
              });
            }

            const valueWithTax = fetched.value_with_tax ?? 0;
            const valueWithoutTax = fetched.value_without_tax ?? 0;
            subtotal = valueWithoutTax / 100;
            tax = Math.round(valueWithTax - valueWithoutTax) / 100;
            total = valueWithTax / 100;
          }
        } catch (err) {
          console.error('Failed to create proposal via API:', err instanceof Error ? err.message : String(err));
          return {
            type: 'proposal_status' as const,
            proposal: {
              title: di.title,
              totalAmount: 0,
              currency: input.currency,
              status: 'error',
              proposalUuid: null,
              proposalUrl: null,
            },
            message: `Something went wrong creating the proposal. Please try again.`,
          };
        }
      }

      // Hold the space for 7 days if booking details are provided
      let holdResult: { success: boolean; error?: string; expires_at?: string } | null = null;
      if (di.space_id && di.event_date && di.time_slot_id && proposalUuid) {
        const hold = holdSpace({
          proposal_uuid: proposalUuid,
          space_id: di.space_id,
          date: di.event_date,
          time_slot_id: di.time_slot_id,
          guests: di.guests || 1,
          event_type: di.venue_type || undefined,
          contact_email: di.recipient_email,
          contact_name: di.recipient_name,
        });
        holdResult = {
          success: hold.success,
          error: hold.error,
          expires_at: hold.hold?.expires_at,
        };
      }

      const formattedAmount = total > 0
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: input.currency }).format(total)
        : '';

      return {
        type: 'proposal_status' as const,
        proposal: {
          title: di.title,
          totalAmount: total,
          currency: input.currency,
          status: 'active',
          proposalUuid,
          proposalUrl,
          items: resolvedItems,
          subtotal,
          tax,
          total,
          venue_type: di.venue_type,
        },
        recipient: {
          name: di.recipient_name,
          email: recipientEmail,
          company: di.recipient_company ?? '',
        },
        company_id: di.company_id,
        space_hold: holdResult ?? undefined,
        booking_details: (di.space_id && di.event_date) ? {
          space_id: di.space_id,
          event_date: di.event_date,
          time_slot_id: di.time_slot_id,
          guests: di.guests,
        } : undefined,
        message: proposalUuid
          ? `Your proposal "${di.title}"${formattedAmount ? ` (${formattedAmount})` : ''} has been created! 🎉 Our sales team will review and send the full proposal to **${recipientEmail}** shortly. Please check your email to review, accept, and e-sign the proposal. You can also track it on the **My Proposals** page.`
          : 'Proposal creation failed. Please try again.',
      };
    },
  });
}
