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
  type: 'viewed' | 'signed' | 'commented' | 'created' | 'sent' | 'expired' | 'updated';
  title: string;
  description: string;
  time: string;
  proposalUuid?: string;
}

export function useActivityFeed(enabled = true) {
  return useSWR<{ data: ActivityFeedEvent[] }>(enabled ? '/api/activity-feed' : null, fetcher, {
    revalidateOnFocus: true,
    refreshInterval: 10000,
    dedupingInterval: 5000,
  });
}

