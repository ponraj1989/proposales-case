import { createClient, type ApiClient } from './client';
import { proposalsEndpoints } from './endpoints/proposals';
import { contentEndpoints } from './endpoints/content';
import { companiesEndpoints } from './endpoints/companies';
import { attachmentsEndpoints } from './endpoints/attachments';
import { inboxEndpoints } from './endpoints/inbox';

export interface ProposalesSDK {
  proposals: ReturnType<typeof proposalsEndpoints>;
  content: ReturnType<typeof contentEndpoints>;
  companies: ReturnType<typeof companiesEndpoints>;
  attachments: ReturnType<typeof attachmentsEndpoints>;
  inbox: ReturnType<typeof inboxEndpoints>;
}

export function createProposalesSDK(config: {
  baseUrl: string;
  token: string;
  companyId?: number;
}): ProposalesSDK {
  const client = createClient(config);

  return {
    proposals: proposalsEndpoints(client),
    content: contentEndpoints(client),
    companies: companiesEndpoints(client),
    attachments: attachmentsEndpoints(client),
    inbox: inboxEndpoints(client),
  };
}

// Re-export everything
export { createClient, ProposalesApiError } from './client';
export type { ApiClient } from './client';
export * from './types';
export * from './validation';
