import { z } from 'zod';
import { tool } from 'ai';
import type { ProposalesSDK, Proposal } from '@proposales/api-client';
import { holdSpace, confirmHold, releaseHold } from './pms';

// ─── Existing tools ───

export function createSearchProposalsTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'Search for proposals by filtering on data properties. Use this when the user asks about existing proposals, wants to find proposals, or needs data for analysis.',
    inputSchema: z.object({
      filters: z
        .record(z.string())
        .optional()
        .describe('Key-value pairs to filter proposals by their data field properties'),
      limit: z
        .number()
        .min(1)
        .max(25)
        .optional()
        .describe('Maximum number of results to return (default 10)'),
    }),
    execute: async ({ filters, limit }) => {
      const result = await sdk.proposals.search(filters, limit ?? 10);
      return result;
    },
  });
}

export function createGetProposalTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'Get full details of a specific proposal by its UUID. Use when the user wants to review, analyze, or get details about a specific proposal.',
    inputSchema: z.object({
      uuid: z.string().describe('The UUID of the proposal to retrieve'),
    }),
    execute: async ({ uuid }) => {
      const result = await sdk.proposals.get(uuid);
      return result;
    },
  });
}

export function createCreateProposalTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'Create a new proposal in the Proposales system. ONLY call this AFTER the user has accepted a draft (e.g. clicked Accept or said they approve). Never call this without prior user approval.',
    inputSchema: z.object({
      company_id: z.number().describe('The company ID the proposal belongs to'),
      language: z.string().length(2).describe('Two-letter language code (e.g., "en", "sv")'),
      title_md: z.string().optional().describe('Proposal title in markdown'),
      description_md: z.string().optional().describe('Proposal description in markdown'),
      recipient: z
        .object({
          first_name: z.string().optional(),
          last_name: z.string().optional(),
          email: z.string().optional(),
          company_name: z.string().optional(),
        })
        .optional()
        .describe('Recipient information'),
      blocks: z
        .array(
          z.object({
            content_id: z.number(),
            type: z.enum(['product-block', 'video-block']).optional(),
          }),
        )
        .optional()
        .describe('Content blocks to include, referenced by variation_id as content_id'),
    }),
    execute: async (input) => {
      const result = await sdk.proposals.create(input);
      return result;
    },
  });
}

export function createPatchProposalTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'Update metadata on an existing proposal. Use when the user wants to modify proposal data fields.',
    inputSchema: z.object({
      uuid: z.string().describe('The UUID of the proposal to update'),
      data: z.record(z.unknown()).describe('The data fields to update'),
    }),
    execute: async ({ uuid, data }) => {
      const result = await sdk.proposals.patchData(uuid, { data });
      return result;
    },
  });
}

// ─── Helpers ───

/** Build public e-sign URL from proposal UUID */
function toEsignUrl(uuid: string | null | undefined): string | null {
  if (!uuid) return null;
  return `https://esign.proposales.com/v/${uuid}`;
}

// ─── New workflow tools ───

const draftItemSchema = z.object({
  content_id: z.number().describe('The variation_id of the content item from the Proposales content library. MUST be a valid ID from listContent.'),
  quantity: z.number().min(1).default(1).describe('Quantity of this item'),
});

export function createGenerateProposalDraftTool(sdk?: ProposalesSDK, userInfo?: { email?: string; name?: string }) {
  return tool({
    description:
      'Generate a structured proposal draft for user review by creating it in the Proposales system. The UI renders this as an interactive card with Accept/Reject buttons. Call this after gathering all requirements. You MUST call listContent first to get available items and use their variation_id as content_id. NEVER invent prices — prices come from the Proposales API. IMPORTANT: If a specific space and date were selected via checkAvailability, you MUST pass space_id, event_date, and time_slot_id — this will hold the space for 7 days while the proposal is pending.',
    inputSchema: z.object({
      title: z.string().describe('Proposal title'),
      description: z
        .string()
        .describe('A 2-3 sentence description of the proposal'),
      items: z
        .array(draftItemSchema)
        .min(1)
        .describe('Content items from the Proposales content library. Each item must have a content_id (variation_id from listContent) and quantity.'),
      currency: z.string().default('USD').describe('Currency code'),
      recipient_name: z.string().describe('Recipient full name'),
      recipient_email: z.string().describe('Recipient email'),
      recipient_company: z.string().optional().describe('Recipient company name'),
      company_id: z.number().describe('Proposales company ID to create under'),
      language: z.string().length(2).default('en').describe('Language code'),
      notes: z.string().optional().describe('Additional notes or special requests'),
      venue_type: z.enum(['room', 'boardroom', 'banquet', 'conference', 'garden', 'restaurant', 'pool']).optional()
        .describe('Primary venue type for the proposal — used for dynamic header image'),
      // Space booking fields — triggers a 7-day hold
      space_id: z.string().optional().describe('Space ID from checkAvailability (e.g. space-grand-ballroom). If provided, the space will be held for 7 days.'),
      event_date: z.string().optional().describe('Event date in YYYY-MM-DD format for the booking hold'),
      time_slot_id: z.string().optional().describe('Time slot ID: morning, afternoon, evening, or full-day'),
      guests: z.number().optional().describe('Number of guests for the event'),
    }),
    execute: async (input) => {
      const recipientEmail = userInfo?.email || input.recipient_email;
      const nameParts = (input.recipient_name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      let proposalUuid: string | null = null;
      let proposalUrl: string | null = null;

      // Build blocks from content items
      const blocks = input.items.map((item) => ({ content_id: item.content_id }));

      // Defaults in case API call fails
      let resolvedItems: { name: string; description: string; quantity: number; unit_price: number; total: number; content_id: number }[] = [];
      let subtotal = 0;
      let tax = 0;
      let total = 0;

      if (sdk) {
        try {
          // 1. Create the proposal with content blocks — Proposales applies real pricing
          const apiResult = await sdk.proposals.create({
            company_id: input.company_id,
            language: input.language,
            title_md: input.title,
            description_md: input.description,
            creator_email: userInfo?.email,
            contact_email: recipientEmail,
            recipient: {
              first_name: firstName,
              last_name: lastName,
              email: recipientEmail,
              company_name: input.recipient_company,
            },
            blocks,
            data: {
              venue_type: input.venue_type ?? null,
              notes: input.notes ?? '',
              status: 'draft',
              negotiation_round: 0,
              discount_applied: 0,
            },
          });

          proposalUuid = apiResult?.proposal?.uuid ?? null;
          proposalUrl = toEsignUrl(proposalUuid);

          // 2. Fetch the created proposal to get real prices from blocks
          if (proposalUuid) {
            const fetchedResult = await sdk.proposals.get(proposalUuid);
            const fetched: Proposal = fetchedResult.data;

            if (fetched.blocks?.length) {
              // Map API blocks back to items with real prices (API returns cents)
              resolvedItems = fetched.blocks.map((block, idx) => {
                const qty = input.items[idx]?.quantity ?? block.quantity ?? 1;
                const unitPriceCents = block.unit_value_with_discount_with_tax ?? 0;
                const unitPrice = unitPriceCents / 100;
                return {
                  name: block.title ?? `Item ${idx + 1}`,
                  description: block.description ?? '',
                  quantity: qty,
                  unit_price: unitPrice,
                  total: Math.round(unitPrice * qty * 100) / 100,
                  content_id: input.items[idx]?.content_id,
                };
              });
            }

            // Use API totals (in cents → dollars)
            const valueWithTax = fetched.value_with_tax ?? 0;
            const valueWithoutTax = fetched.value_without_tax ?? 0;
            subtotal = valueWithoutTax / 100;
            tax = Math.round((valueWithTax - valueWithoutTax)) / 100;
            total = valueWithTax / 100;
          }
        } catch (err) {
          console.error('Failed to create draft proposal via API:', err instanceof Error ? err.message : String(err));
        }
      }

      // ─── Hold the space for 7 days if booking details are provided ───
      let holdResult: { success: boolean; error?: string; expires_at?: string } | null = null;
      if (input.space_id && input.event_date && input.time_slot_id && proposalUuid) {
        const hold = holdSpace({
          proposal_uuid: proposalUuid,
          space_id: input.space_id,
          date: input.event_date,
          time_slot_id: input.time_slot_id,
          guests: input.guests || 1,
          event_type: input.venue_type || undefined,
          contact_email: input.recipient_email,
          contact_name: input.recipient_name,
        });
        holdResult = {
          success: hold.success,
          error: hold.error,
          expires_at: hold.hold?.expires_at,
        };
      }

      return {
        type: 'proposal_draft' as const,
        title: input.title,
        description: input.description,
        items: resolvedItems,
        subtotal,
        tax,
        total,
        currency: input.currency,
        recipient: {
          name: input.recipient_name,
          email: recipientEmail || input.recipient_email,
          company: input.recipient_company ?? '',
        },
        company_id: input.company_id,
        language: input.language,
        notes: input.notes ?? '',
        venue_type: input.venue_type ?? null,
        negotiation_round: 0,
        max_negotiation_rounds: 3,
        discount_applied: 0,
        proposalUuid,
        proposalUrl,
        // Space hold info
        space_hold: holdResult ?? undefined,
        booking_details: (input.space_id && input.event_date) ? {
          space_id: input.space_id,
          event_date: input.event_date,
          time_slot_id: input.time_slot_id,
          guests: input.guests,
        } : undefined,
      };
    },
  });
}

export function createReviseProposalPricingTool(sdk?: ProposalesSDK, userInfo?: { email?: string; name?: string }) {
  return tool({
    description:
      'Revise a proposal with a discount for negotiation. Call this when the user rejects a draft and wants to negotiate. Uses PATCH /v3/proposals/{uuid}/data to update the SAME proposal (no new proposal created). Fetches real base prices from the proposal blocks, applies the negotiation discount, and patches the proposal data with discount metadata.',
    inputSchema: z.object({
      proposal_uuid: z.string().describe('UUID of the proposal to revise (from generateProposalDraft or prior revision — same UUID throughout negotiation)'),
      title: z.string().describe('Proposal title (from the draft)'),
      description: z.string().describe('Proposal description'),
      currency: z.string().describe('Currency code'),
      recipient_name: z.string().describe('Recipient full name'),
      recipient_email: z.string().describe('Recipient email'),
      recipient_company: z.string().optional(),
      company_id: z.number().describe('Proposales company ID'),
      language: z.string().length(2).describe('Language code'),
      current_negotiation_round: z
        .number()
        .min(0)
        .max(3)
        .describe('Current negotiation round (0 = initial, 1 = first counter, etc.)'),
      notes: z.string().optional(),
      venue_type: z.enum(['room', 'boardroom', 'banquet', 'conference', 'garden', 'restaurant', 'pool']).optional()
        .describe('Venue type from the original draft'),
    }),
    execute: async (input) => {
      const round = input.current_negotiation_round + 1;

      // Determine discount based on round
      let discountPercent: number;
      if (round === 1) {
        discountPercent = 7;
      } else if (round === 2) {
        discountPercent = 12;
      } else {
        discountPercent = 18;
      }

      const isFinalOffer = round >= 3;
      const multiplier = (100 - discountPercent) / 100;

      const recipientEmail = userInfo?.email || input.recipient_email;

      // Same UUID and URL throughout negotiation
      const proposalUuid = input.proposal_uuid;
      let proposalUrl: string | null = null;
      let revisedItems: { name: string; description: string; quantity: number; unit_price: number; total: number; content_id: number }[] = [];
      let subtotal = 0;
      let tax = 0;
      let total = 0;

      if (sdk) {
        try {
          // 1. Fetch the existing proposal to get real base prices from blocks
          const fetchedResult = await sdk.proposals.get(proposalUuid);
          const fetched: Proposal = fetchedResult.data;

          // Construct public e-sign URL from UUID
          proposalUrl = toEsignUrl(proposalUuid);

          // 2. Patch the proposal data with negotiation metadata
          await sdk.proposals.patchData(proposalUuid, {
            data: {
              negotiation_round: round,
              discount_applied: discountPercent,
              is_final_offer: isFinalOffer,
              status: 'negotiating',
            },
          });

          // 3. Calculate discounted prices from the real block prices
          if (fetched.blocks?.length) {
            revisedItems = fetched.blocks.map((block) => {
              const qty = block.quantity ?? 1;
              const basePriceCents = block.unit_value_with_discount_with_tax ?? 0;
              const discountedPrice = Math.round(basePriceCents * multiplier) / 100;
              return {
                name: block.title ?? 'Item',
                description: block.description ?? '',
                quantity: qty,
                unit_price: discountedPrice,
                total: Math.round(discountedPrice * qty * 100) / 100,
                content_id: block.content_id ?? 0,
              };
            });
          }

          // Apply discount to API totals
          const valueWithTax = fetched.value_with_tax ?? 0;
          const valueWithoutTax = fetched.value_without_tax ?? 0;
          subtotal = Math.round(valueWithoutTax * multiplier) / 100;
          tax = Math.round((valueWithTax - valueWithoutTax) * multiplier) / 100;
          total = Math.round(valueWithTax * multiplier) / 100;
        } catch (err) {
          console.error('Failed to revise proposal via API:', err instanceof Error ? err.message : String(err));
        }
      }

      return {
        type: 'proposal_draft' as const,
        title: input.title,
        description: input.description,
        items: revisedItems,
        subtotal,
        tax,
        total,
        currency: input.currency,
        recipient: {
          name: input.recipient_name,
          email: recipientEmail || input.recipient_email,
          company: input.recipient_company ?? '',
        },
        company_id: input.company_id,
        language: input.language,
        notes: input.notes ?? '',
        negotiation_round: round,
        max_negotiation_rounds: 3,
        discount_applied: discountPercent,
        is_final_offer: isFinalOffer,
        proposalUuid,
        proposalUrl,
      };
    },
  });
}
