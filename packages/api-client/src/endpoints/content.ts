import type { ApiClient } from '../client';
import type { Content, PaginatedResponse, SingleResponse } from '../types';
import type {
  CreateContentInput,
  UpdateContentInput,
  BulkContentInput,
} from '../validation';

export function contentEndpoints(client: ApiClient) {
  return {
    list: (options?: {
      product_id?: string;
      variation_id?: string;
      include_archived?: boolean;
      include_sources?: boolean;
    }) => {
      const params: Record<string, string> = {};
      if (options?.product_id) params.product_id = options.product_id;
      if (options?.variation_id) params.variation_id = options.variation_id;
      if (options?.include_archived) params.include_archived = 'true';
      if (options?.include_sources) params.include_sources = 'true';
      return client.get<PaginatedResponse<Content>>('/v3/content', params);
    },

    create: (input: CreateContentInput) =>
      client.post<SingleResponse<{ product_id: number; variation_id: number; message: string }>>(
        '/v3/content',
        input,
      ),

    update: (input: UpdateContentInput) =>
      client.put<SingleResponse<{ product_id: number; variation_id: number; message: string }>>(
        '/v3/content',
        input,
      ),

    delete: (id: { product_id?: number; variation_id?: number }) => {
      const params: Record<string, string> = {};
      if (id.product_id) params.product_id = String(id.product_id);
      if (id.variation_id) params.variation_id = String(id.variation_id);
      return client.delete<SingleResponse<{ success: boolean; message: string }>>(
        '/v3/content',
        params,
      );
    },

    bulkArchive: (input: BulkContentInput) =>
      client.delete<
        SingleResponse<{ archived_count: number; product_ids: number[]; message: string }>
      >('/v3/content', { action: 'bulk' }, input),

    bulkRestore: (input: BulkContentInput) =>
      client.post<
        SingleResponse<{ restored_count: number; product_ids: number[]; message: string }>
      >('/v3/content', input, { action: 'restore' }),
  };
}
