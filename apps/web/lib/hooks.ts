'use client';

import useSWR from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(err.error?.message ?? 'Request failed');
  }
  return res.json();
};

export function useProposals(search?: Record<string, string>) {
  const params = new URLSearchParams(search ?? {});
  return useSWR(`/api/proposales/proposals?${params}`, fetcher);
}

export function useProposal(uuid: string) {
  return useSWR(uuid ? `/api/proposales/proposals/${uuid}` : null, fetcher);
}

export function useContent() {
  return useSWR('/api/proposales/content', fetcher);
}

export function useCompanies() {
  return useSWR('/api/proposales/companies', fetcher);
}

export function useCompanyTemplates(companyId: number) {
  return useSWR(
    companyId ? `/api/proposales/companies/${companyId}/templates` : null,
    fetcher,
  );
}

export function useAttachments() {
  return useSWR('/api/proposales/attachments', fetcher);
}

// Mutation helpers
export async function apiPost(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(err.error?.message ?? 'Request failed');
  }
  return res.json();
}

export async function apiPut(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(err.error?.message ?? 'Request failed');
  }
  return res.json();
}

export async function apiDelete(url: string) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(err.error?.message ?? 'Request failed');
  }
  return res.json();
}
