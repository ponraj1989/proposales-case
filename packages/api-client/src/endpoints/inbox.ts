import type { ApiClient } from '../client';
import type { RfpResponse } from '../types';
import type { CreateRfpInput } from '../validation';

export function inboxEndpoints(client: ApiClient) {
  return {
    createRfp: (token: string, input: CreateRfpInput) =>
      client.post<RfpResponse>(
        `/v1/inbox/${encodeURIComponent(token)}`,
        input,
      ),
  };
}
