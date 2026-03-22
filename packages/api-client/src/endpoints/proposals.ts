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

    // Fetches ALL proposals by paginating through every page (page size = 25)
    searchAll: async (filters?: Record<string, string>): Promise<ProposalSearchResult[]> => {
      const all: ProposalSearchResult[] = [];
      let page = 1;
      const pageSize = 25;

      while (true) {
        const params: Record<string, string> = {
          'page[number]': String(page),
          'page[size]': String(pageSize),
        };
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            params[`filter[${key}]`] = value;
          }
        }

        const result = await client.get<SingleResponse<ProposalSearchResult | ProposalSearchResult[]>>(
          '/v3/proposal-search',
          params,
        );

        const items = Array.isArray(result.data)
          ? (result.data as ProposalSearchResult[])
          : result.data
            ? [result.data as ProposalSearchResult]
            : [];

        all.push(...items);

        // If fewer items than page size, we've reached the last page
        if (items.length < pageSize) break;
        page++;
      }

      return all;
    },
  };
}
