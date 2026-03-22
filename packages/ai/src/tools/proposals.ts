import { z } from 'zod';
import { tool } from 'ai';
import { integrationFieldSchema, type ProposalesSDK, type Proposal } from '@proposales/api-client';

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
      'Create a new proposal in the Proposales system. ONLY call this AFTER the user has accepted a draft (e.g. clicked Accept or said they approve). Never call this without prior user approval. Supports all Proposales API fields including invoicing, tax options, attachments, and background media.',
    inputSchema: z.object({
      company_id: z.number().describe('The company ID the proposal belongs to'),
      language: z.string().length(2).describe('Two-letter language code (e.g., "en", "sv")'),
      creator_email: z.string().email().optional().describe('Email of the proposal creator (must be a company member)'),
      contact_email: z.string().email().optional().describe('Internal team contact email for notifications'),
      title_md: z.string().optional().describe('Proposal title in markdown'),
      description_md: z.string().optional().describe('Proposal description in markdown'),
      recipient: z
        .object({
          first_name: z.string().optional(),
          last_name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          company_name: z.string().optional(),
          sources: z.object({
            integration: z.object({
              id: z.number(),
              contactId: z.string(),
              metadata: z
                .object({
                  integration_fields: z.array(integrationFieldSchema).optional(),
                })
                .catchall(z.unknown())
                .optional(),
            }).optional(),
          }).optional(),
        })
        .optional()
        .describe('Recipient (external customer) information'),
      data: z.record(z.unknown()).optional().describe('Custom metadata attached to the proposal (preserved when sent)'),
      invoicing_enabled: z.boolean().optional().describe('Enable invoicing — allows collecting company name, org number, and address on the active proposal'),
      tax_options: z
        .object({
          mode: z.enum(['standard', 'simplified', 'tax-free', 'none']).optional().describe('standard: show tax/VAT totals, simplified: single footer note, tax-free: exempt, none: hidden'),
          tax_included: z.boolean().optional().describe('Whether displayed prices include tax'),
          tax_label_key: z.string().optional().describe('Label for tax (e.g. "VAT", "Tax", "GST")'),
        })
        .optional()
        .describe('Tax display and calculation settings'),
      background_image: z.object({ id: z.number(), uuid: z.string() }).optional().describe('Background image from a template'),
      background_video: z.object({ id: z.number(), uuid: z.string() }).optional().describe('Background video from a template'),
      blocks: z
        .array(
          z.union([
            z.object({
              content_id: z.number(),
              type: z.enum(['product-block', 'video-block']).optional(),
            }),
            z.object({
              type: z.literal('video-block'),
              video_url: z.string(),
              title: z.string(),
            }),
          ]),
        )
        .optional()
        .describe('Content blocks — reference by variation_id as content_id, or inline video blocks'),
      attachments: z
        .array(
          z.union([
            z.object({ id: z.number() }),
            z.object({ mime_type: z.literal('text/html'), name: z.string(), url: z.string() }),
            z.object({ mime_type: z.literal('application/pdf'), name: z.string(), url: z.string() }),
          ]),
        )
        .optional()
        .describe('Attachments — from content library (id), HTML links, or PDF uploads'),
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

export function createReviseProposalTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'Revise an existing proposal by UUID. The user can quote their proposal reference ID (UUID) from the My Proposals page to revise any proposal — even after e-sign or acceptance. Uses PUT for top-level fields (title, description) and PATCH /v3/proposals/{uuid}/data for metadata fields. After updating, fetches and returns the updated proposal. Do NOT use this for price negotiation — use reviseProposalPricing for discounts instead.',
    inputSchema: z.object({
      proposal_uuid: z.string().describe('UUID of the proposal to revise — the user can find this on their My Proposals page as the reference ID'),
      updates: z.object({
        title: z.string().optional().describe('New proposal title'),
        description: z.string().optional().describe('New proposal description'),
        notes: z.string().optional().describe('Updated special requests or notes'),
        event_date: z.string().optional().describe('Updated event date (YYYY-MM-DD)'),
        guests: z.number().optional().describe('Updated guest count'),
        venue_type: z.string().optional().describe('Updated venue type'),
        event_type: z.string().optional().describe('Updated event type'),
        time_slot: z.string().optional().describe('Updated time slot (morning, afternoon, evening, full-day)'),
        contact_name: z.string().optional().describe('Updated contact name'),
        contact_email: z.string().optional().describe('Updated contact email'),
        custom: z.record(z.unknown()).optional().describe('Any other custom data fields to update'),
      }).describe('Fields to update on the proposal'),
    }),
    execute: async (input) => {
      const { proposal_uuid, updates } = input;

      // Build the data payload for PATCH
      const patchData: Record<string, unknown> = {};
      if (updates.notes !== undefined) patchData.notes = updates.notes;
      if (updates.event_date !== undefined) patchData.event_date = updates.event_date;
      if (updates.guests !== undefined) patchData.guests = updates.guests;
      if (updates.venue_type !== undefined) patchData.venue_type = updates.venue_type;
      if (updates.event_type !== undefined) patchData.event_type = updates.event_type;
      if (updates.time_slot !== undefined) patchData.time_slot = updates.time_slot;
      if (updates.contact_name !== undefined) patchData.contact_name = updates.contact_name;
      if (updates.contact_email !== undefined) patchData.contact_email = updates.contact_email;
      if (updates.custom) {
        Object.assign(patchData, updates.custom);
      }

      try {
        // 1. Update top-level fields via PUT if title or description changed
        const putData: Record<string, unknown> = {};
        if (updates.title !== undefined) putData.title_md = updates.title;
        if (updates.description !== undefined) putData.description_md = updates.description;
        if (updates.contact_email !== undefined) putData.contact_email = updates.contact_email;
        if (updates.contact_name !== undefined) {
          const nameParts = updates.contact_name.split(' ');
          putData.recipient = {
            first_name: nameParts[0] || '',
            last_name: nameParts.slice(1).join(' ') || '',
            email: updates.contact_email,
          };
        }

        if (Object.keys(putData).length > 0) {
          await sdk.proposals.update(proposal_uuid, putData);
        }

        // 2. Patch the proposal data sub-object for metadata fields
        if (Object.keys(patchData).length > 0) {
          await sdk.proposals.patchData(proposal_uuid, { data: patchData });
        }

        // 3. Fetch fresh proposal state
        const result = await sdk.proposals.get(proposal_uuid);
        const proposal: Proposal = result.data;

        // Build items from blocks
        const items = (proposal.blocks ?? []).map((block, idx) => {
          const qty = block.quantity ?? 1;
          const unitPriceCents = block.unit_value_with_discount_with_tax ?? 0;
          const unitPrice = unitPriceCents / 100;
          return {
            name: block.title ?? `Item ${idx + 1}`,
            description: block.description ?? '',
            quantity: qty,
            unit_price: unitPrice,
            total: Math.round(unitPrice * qty * 100) / 100,
          };
        });

        const valueWithTax = proposal.value_with_tax ?? 0;
        const valueWithoutTax = proposal.value_without_tax ?? 0;
        const subtotal = valueWithoutTax / 100;
        const tax = Math.round(valueWithTax - valueWithoutTax) / 100;
        const total = valueWithTax / 100;
        const data = (proposal.data ?? {}) as Record<string, unknown>;
        const allUpdatedFields = [...Object.keys(putData), ...Object.keys(patchData)];

        return {
          type: 'proposal_revised' as const,
          proposalUuid: proposal_uuid,
          proposalUrl: proposal.pdf_url ?? null,
          title: updates.title ?? proposal.title_md ?? 'Untitled',
          description: updates.description ?? proposal.description_md ?? '',
          status: proposal.status ?? 'draft',
          items,
          subtotal,
          tax,
          total,
          currency: proposal.currency ?? 'EUR',
          updatedFields: allUpdatedFields,
          data,
          message: `Proposal updated successfully. Changed: ${allUpdatedFields.join(', ')}.`,
        };
      } catch (err) {
        return {
          type: 'proposal_revised' as const,
          proposalUuid: proposal_uuid,
          proposalUrl: null,
          title: updates.title ?? '',
          description: '',
          status: 'unknown',
          items: [],
          subtotal: 0,
          tax: 0,
          total: 0,
          currency: 'EUR',
          updatedFields: [],
          data: {},
          message: `Failed to update proposal: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
}

// ─── New workflow tools ───

const draftItemSchema = z.object({
  content_id: z.number().describe('The variation_id of the content item from the Proposales content library. MUST be a valid ID from listContent.'),
  quantity: z.number().min(1).default(1).describe('Quantity of this item'),
});

export function createGenerateProposalDraftTool(
  sdk?: ProposalesSDK,
  userInfo?: { email?: string; name?: string },
) {
  return tool({
    description:
      'Generate a proposal draft preview for user review. This does NOT create the proposal in Proposales — it only builds a preview card with item names from the content library. The UI renders this as an interactive card with Accept & Generate Proposal / Reject buttons. Call this after gathering all requirements. You MUST call listContent first to get available items and use their variation_id as content_id. NEVER invent prices — prices will be confirmed when the user accepts and the proposal is actually created. The result includes a draft_input object — you MUST pass this unchanged to acceptProposal when the user clicks Accept. CRITICAL: Title must be SHORT — just the event name (max 40 chars). Description must be PRECISE — 1-2 factual sentences. Auto-select room by guest count and include catering items if mentioned.',
    inputSchema: z.object({
      title: z.string().describe('SHORT event name as title — max 40 characters. Examples: "Corporate Gala Dinner", "Annual Sales Conference", "Wedding Reception", "Board Strategy Meeting". Do NOT include guest counts, dates, or package details.'),
      description: z
        .string()
        .describe('PRECISE 1-2 sentence description stating what is included factually. Example: "Conference for 50 attendees with lunch, coffee break, and full AV setup in the Grand Boardroom." No marketing fluff.'),
      items: z
        .array(draftItemSchema)
        .min(1)
        .describe('Content items from the Proposales content library. Each item must have a content_id (variation_id from listContent) and quantity.'),
      currency: z.string().default('USD').describe('Currency code'),
      recipient_name: z.string().describe('Recipient full name'),
      recipient_email: z.string().describe('Recipient email'),
      recipient_company: z.string().optional().describe('Recipient company name'),
      recipient_phone: z.string().optional().describe('Recipient phone number'),
      company_id: z.number().describe('Proposales company ID to create under'),
      language: z.string().length(2).default('en').describe('Language code'),
      notes: z.string().optional().describe('Additional notes or special requests'),
      venue_type: z.enum(['room', 'boardroom', 'banquet', 'conference', 'garden', 'restaurant', 'pool']).optional()
        .describe('Primary venue type for the proposal — used for dynamic header image'),
      // Invoicing & Tax
      invoicing_enabled: z.boolean().optional().describe('Enable invoicing — recipient can provide company name, org number, and billing address on the live proposal'),
      tax_options: z
        .object({
          mode: z.enum(['standard', 'simplified', 'tax-free', 'none']).optional().describe('standard (recommended): itemized tax, simplified: footer note, tax-free: exempt, none: hidden'),
          tax_included: z.boolean().optional().describe('Whether displayed prices include tax'),
          tax_label_key: z.string().optional().describe('Regional tax label e.g. VAT, Tax, GST, Moms'),
        })
        .optional()
        .describe('Tax display and calculation settings for the proposal'),
      // Background media
      background_image: z.object({ id: z.number(), uuid: z.string() }).optional().describe('Background image (from template)'),
      background_video: z.object({ id: z.number(), uuid: z.string() }).optional().describe('Background video (from template)'),
      // Attachments
      attachments: z
        .array(
          z.union([
            z.object({ id: z.number().describe('Attachment ID from content library') }),
            z.object({ mime_type: z.literal('text/html'), name: z.string(), url: z.string() }),
            z.object({ mime_type: z.literal('application/pdf'), name: z.string(), url: z.string() }),
          ]),
        )
        .optional()
        .describe('Attachments — from content library, HTML links, or PDF uploads'),
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

      // ─── Preview-only: resolve content item names from the content library ───
      // The actual Proposales API proposal is NOT created here — only on user accept.
      let resolvedItems: { name: string; description: string; quantity: number; content_id: number; image_url?: string }[] = [];
      let headerImage: string | null = null;

      if (sdk) {
        try {
          const contentResult = await sdk.content.list();
          const contentItems = Array.isArray(contentResult.data) ? contentResult.data : [];
          const contentMap = new Map(contentItems.map((c) => [c.variation_id, c]));

          resolvedItems = input.items.map((item) => {
            const content = contentMap.get(item.content_id);
            const title = content?.title?.en || Object.values(content?.title || {})[0] || `Item #${item.content_id}`;
            const desc = content?.description?.en || Object.values(content?.description || {})[0] || '';
            const firstImage = content?.images?.[0]?.url || undefined;
            return {
              name: title,
              description: desc,
              quantity: item.quantity,
              content_id: item.content_id,
              image_url: firstImage,
            };
          });

          // Pick the best header image: first item with an image, or any content image
          headerImage = resolvedItems.find((i) => i.image_url)?.image_url ?? null;
        } catch (err) {
          console.error('Failed to resolve content items for preview:', err instanceof Error ? err.message : String(err));
          resolvedItems = input.items.map((item) => ({
            name: `Item #${item.content_id}`,
            description: '',
            quantity: item.quantity,
            content_id: item.content_id,
          }));
        }
      }

      return {
        type: 'proposal_draft' as const,
        title: input.title,
        description: input.description,
        items: resolvedItems,
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
        header_image: headerImage,
        negotiation_round: 0,
        max_negotiation_rounds: 3,
        discount_applied: 0,
        // No proposalUuid yet — created only on acceptance
        proposalUuid: null,
        proposalUrl: null,
        // Store full creation params so acceptProposal can forward them
        draft_input: {
          title: input.title,
          description: input.description,
          items: input.items,
          currency: input.currency,
          recipient_name: input.recipient_name,
          recipient_email: recipientEmail,
          recipient_company: input.recipient_company,
          recipient_phone: input.recipient_phone,
          company_id: input.company_id,
          language: input.language,
          notes: input.notes,
          venue_type: input.venue_type,
          invoicing_enabled: input.invoicing_enabled,
          tax_options: input.tax_options,
          background_image: input.background_image,
          background_video: input.background_video,
          attachments: input.attachments,
          space_id: input.space_id,
          event_date: input.event_date,
          time_slot_id: input.time_slot_id,
          guests: input.guests,
        },
        // Space booking details (for display in the draft card)
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
      'Revise a proposal with a discount for negotiation. Call this ONLY after the user has been asked why they rejected and they specifically requested a discount. Uses PATCH /v3/proposals/{uuid}/data to update the SAME proposal (no new proposal created). Fetches real base prices from the proposal blocks, applies a seasonal/demand-based discount, and patches the proposal data with discount metadata. Do NOT mention round counts to the user.',
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
        .describe('Current negotiation round (0 = initial, 1 = first counter, etc.) — internal tracking only, never shown to user'),
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
          // 1. Fetch the current proposal FIRST to get base prices
          const currentResult = await sdk.proposals.get(proposalUuid);
          const current: Proposal = currentResult.data;

          proposalUrl = current.pdf_url ?? null;

          // 2. Build revised items from the ORIGINAL block prices (before any discount)
          if (current.blocks?.length) {
            revisedItems = current.blocks.map((block) => {
              const qty = block.quantity ?? 1;
              // Use the base price from the block (in cents)
              const basePriceCents = block.unit_value_with_discount_with_tax ?? 0;
              // Apply discount to get new price (convert cents to EUR)
              const discountedPrice = Math.round(basePriceCents * multiplier) / 100;
              const lineTotal = Math.round(discountedPrice * qty * 100) / 100;
              return {
                name: block.title ?? 'Item',
                description: block.description ?? '',
                quantity: qty,
                unit_price: discountedPrice,
                total: lineTotal,
                content_id: block.content_id ?? 0,
              };
            });
          }

          // 3. Compute totals from the revised items (more reliable than API totals * multiplier)
          const valueWithTax = current.value_with_tax ?? 0;
          const valueWithoutTax = current.value_without_tax ?? 0;

          if (valueWithTax > 0) {
            // Use API totals if available
            subtotal = Math.round(valueWithoutTax * multiplier) / 100;
            tax = Math.round((valueWithTax - valueWithoutTax) * multiplier) / 100;
            total = Math.round(valueWithTax * multiplier) / 100;
          } else {
            // Fallback: compute from revised items
            subtotal = revisedItems.reduce((s, item) => s + item.total, 0);
            tax = Math.round(subtotal * 0.1 * 100) / 100; // estimated 10% tax
            total = Math.round((subtotal + tax) * 100) / 100;
          }

          // 4. Patch the proposal data with negotiation metadata
          await sdk.proposals.patchData(proposalUuid, {
            data: {
              negotiation_round: round,
              discount_applied: discountPercent,
              is_final_offer: isFinalOffer,
              status: 'negotiating',
            },
          });
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
