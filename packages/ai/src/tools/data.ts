import { z } from 'zod';
import { tool } from 'ai';
import type { ProposalesSDK } from '@proposales/api-client';

export function createListContentTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'List available content (products/videos) from the content library. Use when the user needs to browse available products or when building a proposal.',
    parameters: z.object({
      include_archived: z
        .boolean()
        .optional()
        .describe('Whether to include archived content'),
    }),
    execute: async ({ include_archived }) => {
      const result = await sdk.content.list({ include_archived });
      return result;
    },
  });
}

export function createListCompaniesTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'List all companies the user has access to. Use when needing company information for creating proposals.',
    parameters: z.object({}),
    execute: async () => {
      const result = await sdk.companies.list();
      return result;
    },
  });
}

export function createListTemplatesTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'List proposal templates for a specific company. Use when the user wants to see available templates or start a proposal from a template.',
    parameters: z.object({
      company_id: z.number().describe('The company ID to list templates for'),
    }),
    execute: async ({ company_id }) => {
      const result = await sdk.companies.listTemplates(company_id);
      return result;
    },
  });
}
