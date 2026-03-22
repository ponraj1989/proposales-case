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

// ─── User / Role ───
export interface UserInfo {
  authenticated: boolean;
  role: 'customer' | 'sales';
  userId: string | null;
  stableUid: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
}

export function useUser() {
  return useSWR<UserInfo>('/api/auth/me', fetcher, {
    dedupingInterval: 60000,      // dedupe calls within 1 minute
    revalidateOnFocus: false,     // don't re-fetch when tab regains focus
    revalidateOnReconnect: false, // don't re-fetch on network reconnect
  });
}

// ─── Proposales API hooks ───

export function useProposals(search?: Record<string, string>) {
  const params = new URLSearchParams(search ?? {});
  return useSWR(`/api/proposales/proposals?${params}`, fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  });
}

export function useProposal(uuid: string) {
  return useSWR(uuid ? `/api/proposales/proposals/${uuid}` : null, fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: false,
    dedupingInterval: 10000,
  });
}

export function useContent(options?: {
  include_archived?: boolean;
  include_sources?: boolean;
  product_id?: string;
  variation_id?: string;
}) {
  const params = new URLSearchParams();
  if (options?.include_archived) params.set('include_archived', 'true');
  if (options?.include_sources) params.set('include_sources', 'true');
  if (options?.product_id) params.set('product_id', options.product_id);
  if (options?.variation_id) params.set('variation_id', options.variation_id);
  const query = params.toString();
  return useSWR(`/api/proposales/content${query ? `?${query}` : ''}`, fetcher);
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

export async function apiPatch(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(err.error?.message ?? 'Request failed');
  }
  return res.json();
}

export async function apiDelete(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(err.error?.message ?? 'Request failed');
  }
  return res.json();
}

// ─── Email Logs ───

export interface EmailLogEntry {
  _id: string;
  proposalUuid: string;
  to: string;
  recipientName: string;
  subject: string;
  type: 'esign' | 'proposal' | 'reminder' | 'follow_up';
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  sentAt: string;
  openedAt?: string;
  clickedAt?: string;
  sentBy?: string;
}

export function useEmailLogs(proposalUuid?: string) {
  const url = proposalUuid
    ? `/api/email-logs?proposal_uuid=${proposalUuid}`
    : '/api/email-logs';
  return useSWR<{ data: EmailLogEntry[] }>(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}

// ─── Activity Feed ───

export interface ActivityFeedEvent {
  id: string;
  type: 'viewed' | 'signed' | 'commented' | 'created' | 'sent' | 'rejected' | 'expired' | 'updated';
  title: string;
  description: string;
  time: string;
  proposalUuid?: string;
  proposalTitle?: string;
  recipientName?: string;
  amount?: number;
  currency?: string;
}

export function useActivityFeed(enabled = true) {
  return useSWR<{ data: ActivityFeedEvent[] }>(enabled ? '/api/activity-feed' : null, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 30000,
    dedupingInterval: 15000,
  });
}

// ─── My Proposals (customer view) ───

export interface MyProposal {
  _id: string;
  proposalUuid: string;
  proposalTitle: string;
  proposalUrl: string | null;
  status: 'draft' | 'active' | 'sent' | 'viewed' | 'accepted' | 'signed' | 'rejected' | 'expired' | 'withdrawn';
  totalAmountCents: number;
  currency: string;
  venueType?: string;
  eventDate?: string;
  guests?: number;
  viewedCount: number;
  createdAt: string;
  updatedAt: string;
}

export function useMyProposals() {
  return useSWR<{ data: MyProposal[] }>('/api/my-proposals', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10000,
  });
}

