import type { ApiClient } from '../client';
import type {
  Proposal,
  ProposalSearchResult,
  SingleResponse,
  PaginatedResponse,
} from '../types';
import type { CreateProposalInput, PatchProposalDataInput } from '../validation';

export function proposalsEndpoints(client: ApiClient) {
  return {
    create: (input: CreateProposalInput) =>
      client.post<{ proposal: { uuid: string; url: string } }>(
        '/v3/proposals',
        input,
      ),

    get: (uuid: string) =>
      client.get<SingleResponse<Proposal>>(`/v3/proposals/${encodeURIComponent(uuid)}`),

    patchData: (uuid: string, input: PatchProposalDataInput) =>
      client.patch<SingleResponse<Record<string, unknown>>>(
        `/v3/proposals/${encodeURIComponent(uuid)}/data`,
        input,
      ),

    search: (filters?: Record<string, string>, limit = 25) => {
      const params: Record<string, string> = {};
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          params[`filter[${key}]`] = value;
        }
      }
      params.limit = String(Math.min(Math.max(limit, 1), 25));
      return client.get<SingleResponse<ProposalSearchResult | ProposalSearchResult[]>>(
        '/v3/proposal-search',
        params,
      );
    },

    // Fetches ALL proposals by querying each status separately and merging.
    // The Proposales API caps results at 25 per request and ignores offset/page,
    // so we fan out by status to maximise coverage.
    searchAll: async (filters?: Record<string, string>): Promise<ProposalSearchResult[]> => {
      const seenUuids = new Set<string>();
      const all: ProposalSearchResult[] = [];

      const addItems = (items: ProposalSearchResult[]) => {
        for (const item of items) {
          if (!seenUuids.has(item.uuid)) {
            seenUuids.add(item.uuid);
            all.push(item);
          }
        }
      };

      const doSearch = async (extraFilters?: Record<string, string>) => {
        const result = await client.get<SingleResponse<ProposalSearchResult | ProposalSearchResult[]>>(
          '/v3/proposal-search',
          {
            ...Object.fromEntries(
              Object.entries({ ...(filters || {}), ...(extraFilters || {}) }).map(([key, value]) => [
                `filter[${key}]`,
                value,
              ]),
            ),
            limit: '25',
          },
        );
        const items = Array.isArray(result.data)
          ? (result.data as ProposalSearchResult[])
          : result.data ? [result.data as ProposalSearchResult] : [];
        addItems(items);
      };

      // If the caller already specified a status filter, do a single query
      if (filters?.status) {
        await doSearch();
        return all;
      }

      // Fan out: one unfiltered query + one per status to maximise coverage
      const statuses = ['draft', 'active', 'accepted', 'rejected', 'lost', 'expired', 'template', 'withdrawn', 'replaced'];
      await doSearch(); // unfiltered first
      await Promise.all(statuses.map((s) => doSearch({ status: s })));

      return all;
    },
  };
}
