import { tool } from 'ai';
import { z } from 'zod';
import type { ProposalesSDK } from '@proposales/api-client';
import { confirmHold } from './pms';

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

/** Callback type for sending e-sign emails */
export type SendEsignEmailFn = (options: {
  to: string;
  recipientName: string;
  proposalTitle: string;
  totalAmount: string;
  esignUrl: string;
}) => Promise<boolean>;

/**
 * Tool: acceptProposal
 * Marks an existing Proposales proposal as accepted via the API.
 * Sends an e-sign email to the recipient in parallel.
 * Returns the proposal URL for e-signing (shown in chat + sent via email).
 */
export function createAcceptProposalTool(
  sdk?: ProposalesSDK,
  userInfo?: { email?: string; name?: string },
  sendEsignEmail?: SendEsignEmailFn,
) {
  return tool({
    description:
      'Accept the current proposal and confirm the booking. The proposal already exists in the Proposales system (created when the draft was generated). Pass the proposal UUID from the draft so it can be updated to "accepted" status. This will also send an e-sign email to the recipient. Also pass ALL key details for the confirmation message.',
    inputSchema: z.object({
      proposalTitle: z.string().describe('Title of the accepted proposal'),
      totalAmount: z.number().describe('Total amount in dollars'),
      currency: z.string().default('USD').describe('Currency code'),
      proposalUuid: z.string().optional().describe('UUID of the proposal from the draft (returned by generateProposalDraft or reviseProposalPricing)'),
      proposalUrl: z.string().optional().describe('URL of the proposal from the draft'),
    }),
    execute: async (input) => {
      const finalUuid = input.proposalUuid || null;
      // Build e-sign URL from UUID
      let finalUrl = finalUuid ? `https://esign.proposales.com/v/${finalUuid}` : (input.proposalUrl || null);

      const recipientEmail = userInfo?.email || '';
      const recipientName = userInfo?.name || 'Guest';
      const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: input.currency,
      }).format(input.totalAmount);

      // Run API patch and email send in parallel
      const patchPromise = (sdk && input.proposalUuid)
        ? sdk.proposals.patchData(input.proposalUuid, {
            data: {
              status: 'accepted',
              accepted_at: new Date().toISOString(),
              accepted_by: userInfo?.email || null,
            },
          }).then(async () => {
            // Fetch the proposal to get the latest URL
            const proposalData = await sdk.proposals.get(input.proposalUuid!);
            const proposal = (proposalData as { data?: { url?: string } })?.data;
            // Keep e-sign URL based on UUID (already set above)
          }).catch((err) => {
            console.error('Failed to update proposal via API:', err instanceof Error ? err.message : String(err));
          })
        : Promise.resolve();

      const emailPromise = (sendEsignEmail && finalUrl && recipientEmail)
        ? sendEsignEmail({
            to: recipientEmail,
            recipientName,
            proposalTitle: input.proposalTitle,
            totalAmount: formattedAmount,
            esignUrl: finalUrl,
          }).catch((err) => {
            console.error('Failed to send e-sign email:', err instanceof Error ? err.message : String(err));
            return false;
          })
        : Promise.resolve(false);

      const [, emailSent] = await Promise.all([patchPromise, emailPromise]);

      // ─── Confirm the hold → book the space in PMS ───
      let bookingConfirmation: { booking_ref?: string; error?: string } | null = null;
      if (finalUuid) {
        const holdResult = confirmHold(finalUuid);
        if (holdResult.success) {
          bookingConfirmation = { booking_ref: holdResult.booking_ref };
        } else {
          bookingConfirmation = { error: holdResult.error };
        }
      }

      const emailNote = emailSent
        ? ` An e-sign link has also been sent to ${recipientEmail}.`
        : '';
      const bookingNote = bookingConfirmation?.booking_ref
        ? ` Space confirmed — booking ref: ${bookingConfirmation.booking_ref}.`
        : '';

      return {
        type: 'booking_confirmed' as const,
        booking: {
          title: input.proposalTitle,
          totalAmount: input.totalAmount,
          currency: input.currency,
          status: 'confirmed',
          proposalUuid: finalUuid,
          proposalUrl: finalUrl,
          booking_ref: bookingConfirmation?.booking_ref ?? null,
        },
        esign: finalUrl
          ? { url: finalUrl, message: 'You can review and e-sign your proposal at the link below.' }
          : null,
        emailSent: !!emailSent,
        message: `Booking confirmed! "${input.proposalTitle}" for ${formattedAmount}.${bookingNote}${finalUrl ? ` You can view and e-sign your proposal here: ${finalUrl}` : ' You\'ll receive a confirmation shortly.'}${emailNote}`,
      };
    },
  });
}
