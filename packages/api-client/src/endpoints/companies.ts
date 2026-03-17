import type { ApiClient } from '../client';
import type { Company, CompanyTemplate, PaginatedResponse } from '../types';

export function companiesEndpoints(client: ApiClient) {
  return {
    list: () => client.get<PaginatedResponse<Company>>('/v3/companies'),

    listTemplates: (companyId: number) =>
      client.get<PaginatedResponse<CompanyTemplate>>(
        `/v3/companies/${encodeURIComponent(String(companyId))}/templates`,
      ),
  };
}
