import type { ApiError } from './types';

export class ProposalesApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: ApiError,
  ) {
    super(message);
    this.name = 'ProposalesApiError';
  }
}

interface ClientConfig {
  baseUrl: string;
  token: string;
  companyId?: number;
}

export function createClient(config: ClientConfig) {
  const { baseUrl, token, companyId } = config;

  async function request<T>(
    path: string,
    options: RequestInit & { params?: Record<string, string> } = {},
  ): Promise<T> {
    const { params, ...fetchOptions } = options;

    const url = new URL(path, baseUrl);
    if (companyId) {
      url.searchParams.set('company_id', String(companyId));
    }
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      ...fetchOptions,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      let body: ApiError | undefined;
      try {
        body = await response.json();
      } catch {
        // Response body may not be JSON
      }
      throw new ProposalesApiError(
        body?.error?.message ?? `API request failed with status ${response.status}`,
        response.status,
        body,
      );
    }

    return response.json() as Promise<T>;
  }

  return {
    get: <T>(path: string, params?: Record<string, string>) =>
      request<T>(path, { method: 'GET', params }),

    post: <T>(path: string, body?: unknown, params?: Record<string, string>) =>
      request<T>(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
        params,
      }),

    put: <T>(path: string, body: unknown) =>
      request<T>(path, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    patch: <T>(path: string, body: unknown) =>
      request<T>(path, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    delete: <T>(path: string, params?: Record<string, string>, body?: unknown) =>
      request<T>(path, {
        method: 'DELETE',
        params,
        body: body ? JSON.stringify(body) : undefined,
      }),
  };
}

export type ApiClient = ReturnType<typeof createClient>;
