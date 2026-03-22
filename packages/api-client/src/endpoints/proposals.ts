import type { ApiClient } from '../client';
import type {
  Proposal,
  ProposalSearchResult,
  SingleResponse,
  PaginatedResponse,
} from '../types';
import type { CreateProposalInput, PatchProposalDataInput, UpdateProposalInput } from '../validation';

export function proposalsEndpoints(client: ApiClient) {
  return {
    create: (input: CreateProposalInput) =>
      client.post<{ proposal: { uuid: string; url: string } }>(
        '/v3/proposals',
        input,
      ),

    get: (uuid: string) =>
      client.get<SingleResponse<Proposal>>(`/v3/proposals/${encodeURIComponent(uuid)}`),

    update: (uuid: string, input: UpdateProposalInput) =>
      client.put<SingleResponse<Proposal>>(
        `/v3/proposals/${encodeURIComponent(uuid)}`,
        input,
      ),

    patchData: (uuid: string, input: PatchProposalDataInput) =>
      client.patch<SingleResponse<Record<string, unknown>>>(
        `/v3/proposals/${encodeURIComponent(uuid)}/data`,
        input,
      ),

    search: (filters?: Record<string, string>, limit?: number) => {
      const params: Record<string, string> = {};
      if (limit) params.limit = String(limit);
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          params[`filter[${key}]`] = value;
        }
      }
      return client.get<SingleResponse<ProposalSearchResult | ProposalSearchResult[]>>(
        '/v3/proposal-search',
        params,
      );
    },
  };
}
