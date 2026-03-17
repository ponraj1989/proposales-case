import { z } from 'zod';
import { tool } from 'ai';
import type { ProposalesSDK } from '@proposales/api-client';

// ─── Existing tools ───

export function createSearchProposalsTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'Search for proposals by filtering on data properties. Use this when the user asks about existing proposals, wants to find proposals, or needs data for analysis.',
    parameters: z.object({
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
    parameters: z.object({
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
    parameters: z.object({
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
    parameters: z.object({
      uuid: z.string().describe('The UUID of the proposal to update'),
      data: z.record(z.unknown()).describe('The data fields to update'),
    }),
    execute: async ({ uuid, data }) => {
      const result = await sdk.proposals.patchData(uuid, { data });
      return result;
    },
  });
}

// ─── New workflow tools ───

const draftItemSchema = z.object({
  name: z.string().describe('Item / service name'),
  description: z.string().describe('Brief description'),
  quantity: z.number().min(1).describe('Quantity'),
  unit_price: z.number().min(0).describe('Price per unit in dollars (not cents)'),
  total: z.number().min(0).describe('quantity × unit_price'),
  content_id: z
    .number()
    .optional()
    .describe('Matching content/variation ID from the content library, if available'),
});

export function createGenerateProposalDraftTool() {
  return tool({
    description:
      'Generate a structured proposal draft for user review. The UI renders this as an interactive card with Accept/Reject buttons. Call this after gathering all requirements from the user. Do NOT call createProposal yet — wait for the user to accept.',
    parameters: z.object({
      title: z.string().describe('Proposal title'),
      description: z
        .string()
        .describe('A 2-3 sentence description of the proposal'),
      items: z
        .array(draftItemSchema)
        .min(1)
        .describe('Line items with pricing'),
      currency: z.string().default('USD').describe('Currency code'),
      recipient_name: z.string().describe('Recipient full name'),
      recipient_email: z.string().describe('Recipient email'),
      recipient_company: z.string().optional().describe('Recipient company name'),
      company_id: z.number().describe('Proposales company ID to create under'),
      language: z.string().length(2).default('en').describe('Language code'),
      notes: z.string().optional().describe('Additional notes or special requests'),
    }),
    execute: async (input) => {
      const subtotal = input.items.reduce((sum, item) => sum + item.total, 0);
      const tax = Math.round(subtotal * 0.1 * 100) / 100; // 10% tax estimate
      const total = Math.round((subtotal + tax) * 100) / 100;

      return {
        type: 'proposal_draft' as const,
        title: input.title,
        description: input.description,
        items: input.items,
        subtotal,
        tax,
        total,
        currency: input.currency,
        recipient: {
          name: input.recipient_name,
          email: input.recipient_email,
          company: input.recipient_company ?? '',
        },
        company_id: input.company_id,
        language: input.language,
        notes: input.notes ?? '',
        negotiation_round: 0,
        max_negotiation_rounds: 3,
        discount_applied: 0,
      };
    },
  });
}

export function createReviseProposalPricingTool() {
  return tool({
    description:
      'Revise a proposal draft with an autonomous discount for negotiation. Call this when the user rejects a draft and wants to negotiate. Automatically applies an appropriate discount based on the negotiation round. Returns a revised draft card.',
    parameters: z.object({
      title: z.string().describe('Proposal title (from previous draft)'),
      description: z.string().describe('Proposal description'),
      items: z
        .array(draftItemSchema)
        .min(1)
        .describe('Original line items with ORIGINAL pricing (before any discount)'),
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
    }),
    execute: async (input) => {
      const round = input.current_negotiation_round + 1;

      // Determine discount based on round
      let discountPercent: number;
      if (round === 1) {
        discountPercent = 7; // 5-8% range, pick 7
      } else if (round === 2) {
        discountPercent = 12; // 10-15% range, pick 12
      } else {
        discountPercent = 18; // up to 20%, pick 18 as "best and final"
      }

      const isFinalOffer = round >= 3;
      const multiplier = (100 - discountPercent) / 100;

      const revisedItems = input.items.map((item) => ({
        ...item,
        unit_price: Math.round(item.unit_price * multiplier * 100) / 100,
        total: Math.round(item.quantity * item.unit_price * multiplier * 100) / 100,
      }));

      const subtotal = revisedItems.reduce((sum, item) => sum + item.total, 0);
      const tax = Math.round(subtotal * 0.1 * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;

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
          email: input.recipient_email,
          company: input.recipient_company ?? '',
        },
        company_id: input.company_id,
        language: input.language,
        notes: input.notes ?? '',
        negotiation_round: round,
        max_negotiation_rounds: 3,
        discount_applied: discountPercent,
        is_final_offer: isFinalOffer,
      };
    },
  });
}
