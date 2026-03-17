import type { ApiClient } from '../client';
import type { Attachment } from '../types';

export function attachmentsEndpoints(client: ApiClient) {
  return {
    list: () =>
      client.get<{ attachments: Attachment[] }>('/v1/attachments'),
  };
}
