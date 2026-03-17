import { z } from 'zod';

// ─── Proposal Schemas ───
const recipientSchema = z.union([
  z.object({ id: z.number() }),
  z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    company_name: z.string().optional(),
  }),
]);

const blockInputSchema = z.union([
  z.object({
    content_id: z.number(),
    type: z.enum(['product-block', 'video-block']).optional(),
  }),
  z.object({
    type: z.literal('video-block'),
    video_url: z.string().url(),
    title: z.string().min(1),
  }),
]);

const attachmentInputSchema = z.union([
  z.object({ id: z.number() }),
  z.object({
    mime_type: z.literal('text/html'),
    name: z.string().min(1),
    url: z.string().url(),
  }),
  z.object({
    mime_type: z.literal('application/pdf'),
    name: z.string().min(1),
    url: z.string().url(),
  }),
]);

export const createProposalSchema = z.object({
  company_id: z.number(),
  language: z.string().length(2),
  creator_email: z.string().email().optional(),
  contact_email: z.string().email().optional(),
  background_image: z.object({ id: z.number(), uuid: z.string() }).optional(),
  background_video: z.object({ id: z.number(), uuid: z.string() }).optional(),
  title_md: z.string().optional(),
  description_md: z.string().optional(),
  recipient: recipientSchema.optional(),
  data: z.record(z.unknown()).optional(),
  invoicing_enabled: z.boolean().optional(),
  tax_options: z
    .object({
      mode: z.enum(['standard', 'simplified', 'tax-free', 'none']).optional(),
      tax_included: z.boolean().optional(),
      tax_label_key: z.string().optional(),
    })
    .optional(),
  blocks: z.array(blockInputSchema).optional(),
  attachments: z.array(attachmentInputSchema).optional(),
});

export type CreateProposalInput = z.infer<typeof createProposalSchema>;

export const patchProposalDataSchema = z.object({
  data: z.record(z.unknown()),
});

export type PatchProposalDataInput = z.infer<typeof patchProposalDataSchema>;

export const searchProposalsSchema = z.object({
  filters: z.record(z.string()).optional(),
  limit: z.number().min(1).max(25).optional(),
});

export type SearchProposalsInput = z.infer<typeof searchProposalsSchema>;

// ─── Content Schemas ───
const imageInputSchema = z.object({
  uuid: z.string(),
  filename: z.string().optional(),
  mime_type: z.string().optional(),
  url: z.string().url().optional(),
  size: z.number().optional(),
  height: z.number().optional(),
  width: z.number().optional(),
});

export const createContentSchema = z.object({
  company_id: z.number(),
  language: z.string().length(2),
  title: z.string().min(1),
  description: z.string().optional(),
  images: z.array(imageInputSchema).optional(),
});

export type CreateContentInput = z.infer<typeof createContentSchema>;

export const updateContentSchema = z.object({
  variation_id: z.number().optional(),
  product_id: z.number().optional(),
  language: z.string().length(2),
  title: z.string().optional(),
  description: z.string().optional(),
  images: z.array(imageInputSchema).optional(),
}).refine((data) => data.variation_id || data.product_id, {
  message: 'Either variation_id or product_id must be provided',
});

export type UpdateContentInput = z.infer<typeof updateContentSchema>;

export const bulkContentSchema = z.object({
  variation_ids: z.array(z.number()).optional(),
  product_ids: z.array(z.number()).optional(),
}).refine((data) => data.variation_ids?.length || data.product_ids?.length, {
  message: 'Either variation_ids or product_ids must be provided',
});

export type BulkContentInput = z.infer<typeof bulkContentSchema>;

// ─── Inbox/RFP Schema ───
export const createRfpSchema = z.object({
  email: z.string().email(),
  company_name: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone_number: z.string().optional(),
  message: z.string().optional(),
  language: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  is_test: z.string().optional(),
  silent_confirmation: z.string().optional(),
});

export type CreateRfpInput = z.infer<typeof createRfpSchema>;
