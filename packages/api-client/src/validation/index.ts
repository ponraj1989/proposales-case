import { z } from 'zod';

const integrationIconNameSchema = z.enum([
  'person',
  'attendees',
  'accommodation',
  'chevron-right',
  'add',
]);

const integrationSelectFieldSchema = z.object({
  type: z.literal('select'),
  id: z.string().min(1),
  helpLabel: z.string().optional(),
  defaultValue: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  options: z.array(z.object({ name: z.string().min(1), value: z.string().optional() })).optional(),
});

const integrationTextFieldSchema = z.object({
  type: z.enum(['text', 'url', 'tel', 'email', 'password']),
  id: z.string().min(1),
  helpLabel: z.string().optional(),
  defaultValue: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  icon: integrationIconNameSchema.optional(),
});

const integrationNumberFieldSchema = z.object({
  type: z.literal('number'),
  id: z.string().min(1),
  defaultValue: z.union([z.number(), z.string()]).optional(),
  helpLabel: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  icon: integrationIconNameSchema.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  integerOnly: z.boolean().optional(),
});

const integrationHiddenFieldSchema = z.object({
  type: z.literal('hidden'),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const integrationSwitchFieldSchema = z.object({
  type: z.literal('switch'),
  id: z.string().min(1),
  defaultValue: z.boolean().optional(),
  helpLabel: z.string().optional(),
  readOnly: z.boolean().optional(),
});

const integrationLinkButtonFieldSchema = z.object({
  type: z.literal('linkButton'),
  label: z.string().min(1),
  href: z.string().url(),
  icon: integrationIconNameSchema,
});

const integrationDividerFieldSchema = z.object({
  type: z.literal('divider'),
  text: z.string().optional(),
});

const integrationHeaderFieldSchema = z.object({
  type: z.literal('header'),
  text: z.string().min(1),
});

const integrationTextBodyFieldSchema = z.object({
  type: z.literal('textBody'),
  text: z.string().min(1),
  markdown: z.boolean().optional(),
});

export const integrationFieldSchema = z.union([
  integrationSelectFieldSchema,
  integrationTextFieldSchema,
  integrationNumberFieldSchema,
  integrationHiddenFieldSchema,
  integrationSwitchFieldSchema,
  integrationLinkButtonFieldSchema,
  integrationDividerFieldSchema,
  integrationHeaderFieldSchema,
  integrationTextBodyFieldSchema,
]);

export const integrationFieldArraySchema = z.array(integrationFieldSchema);

const integrationMetadataSchema = z
  .record(z.unknown())
  .and(z.object({ integration_fields: integrationFieldArraySchema.optional() }));

// ─── Proposal Schemas ───
const recipientSchema = z.union([
  z.object({ id: z.number() }),
  z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    company_name: z.string().optional(),
    sources: z.object({
      integration: z.object({
        id: z.number(),
        contactId: z.string(),
        metadata: integrationMetadataSchema.optional(),
      }).optional(),
    }).optional(),
  }),
]);

const blockInputSchema = z.union([
  z.object({
    content_id: z.number(),
    quantity: z.number().min(1).optional(),
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

export const updateProposalSchema = z.object({
  title_md: z.string().optional(),
  description_md: z.string().optional(),
  contact_email: z.string().email().optional(),
  recipient: recipientSchema.optional(),
  blocks: z.array(blockInputSchema).optional(),
  data: z.record(z.unknown()).optional(),
  tax_options: z.object({
    mode: z.enum(['standard', 'simplified', 'tax-free', 'none']).optional(),
    tax_included: z.boolean().optional(),
    tax_label_key: z.string().optional(),
  }).optional(),
}).passthrough();

export type UpdateProposalInput = z.infer<typeof updateProposalSchema>;

export const patchProposalDataSchema = z.object({
  uuid: z.string().optional(),
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
