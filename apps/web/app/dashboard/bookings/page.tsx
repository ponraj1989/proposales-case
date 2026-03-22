'use client';

import { useState, useEffect } from 'react';
import { useMyProposals, type MyProposal } from '@/lib/hooks';
import { StatusBadge, formatCurrency, formatRelativeTime } from '@proposales/ui';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  active: { label: 'Active', color: 'bg-blue-100 text-blue-700' },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  viewed: { label: 'Viewed', color: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepted', color: 'bg-green-100 text-green-700' },
  signed: { label: 'E-Signed', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-600' },
  expired: { label: 'Expired', color: 'bg-gray-100 text-gray-500' },
  withdrawn: { label: 'Withdrawn', color: 'bg-gray-100 text-gray-600' },
};

const STATUS_STEPS = ['draft', 'sent', 'viewed', 'signed'] as const;

function normalizeProgressStatus(status: string): 'draft' | 'sent' | 'viewed' | 'signed' {
  if (status === 'signed' || status === 'accepted') return 'signed';
  if (status === 'viewed') return 'viewed';
  if (status === 'sent' || status === 'active') return 'sent';
  return 'draft';
}

function ProposalStatusTracker({ status }: { status: string }) {
  const normalizedStatus = normalizeProgressStatus(status);
  const currentIdx = STATUS_STEPS.indexOf(normalizedStatus);
  const isTerminal = status === 'rejected' || status === 'expired' || status === 'withdrawn';

  return (
    <div className="flex items-center gap-1 mt-3">
      {STATUS_STEPS.map((step, idx) => {
        const reached = !isTerminal && currentIdx >= idx;
        return (
          <div key={step} className="flex items-center gap-1">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${reached ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'}`}>
              {reached ? '✓' : idx + 1}
            </div>
            <span className={`text-xs ${reached ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
              {step === 'signed' ? 'E-Signed' : step.charAt(0).toUpperCase() + step.slice(1)}
            </span>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`w-6 h-0.5 ${reached && currentIdx > idx ? 'bg-gray-900' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
      {isTerminal && (
        <div className="ml-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
            {status === 'rejected' ? 'Rejected' : status === 'withdrawn' ? 'Withdrawn' : 'Expired'}
          </span>
        </div>
      )}
    </div>
  );
}

export default function BookingsPage() {
  const { data, isLoading, error, mutate } = useMyProposals();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const proposals: MyProposal[] = data?.data ?? [];

  // Live SSE updates — refresh the list whenever the server pushes a proposal status change.
  // Falls back to the SWR refreshInterval (60 s) if the SSE connection drops.
  useEffect(() => {
    let stream: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      stream = new EventSource('/api/my-proposals/stream');

      stream.addEventListener('proposal-update', () => {
        void mutate();
        setLastRefreshed(new Date());
      });

      stream.onerror = () => {
        stream?.close();
        stream = null;
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stream?.close();
    };
  }, [mutate]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await mutate();
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Proposals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track your proposals and their e-sign status
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Refresh proposals list"
        >
          <svg
            className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.97 8.97 0 005.5 15m0 0H4m15.5 0H21" />
          </svg>
          Refresh
        </button>
      </div>
      {lastRefreshed && (
        <p className="text-xs text-gray-400">
          Last updated: {lastRefreshed.toLocaleTimeString()}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error.message || 'Failed to load proposals'}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-6">
              <div className="h-5 w-48 rounded bg-gray-200" />
              <div className="mt-3 h-4 w-32 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : proposals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-gray-700">No proposals yet</h3>
          <p className="mt-2 text-sm text-gray-500">
            Start a conversation with our AI assistant to plan your event!
          </p>
          <a
            href="/dashboard/ai"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Chat with AI
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((p) => {
            const statusInfo = STATUS_LABELS[p.status] || STATUS_LABELS.draft;
            const amountDisplay = p.totalAmountCents > 0
              ? formatCurrency(p.totalAmountCents, p.currency)
              : null;

            return (
              <div
                key={p.proposalUuid}
                className="rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="truncate text-lg font-semibold text-gray-900">{p.proposalTitle}</h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>

                    <p className="mt-1 text-xs font-mono text-gray-500">
                      Booking Number: {p.proposalUuid}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
                      {p.venueType && (
                        <span className="flex items-center gap-1.5 capitalize">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18m16.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                          </svg>
                          {p.venueType}
                        </span>
                      )}
                      {p.eventDate && (
                        <span className="flex items-center gap-1.5">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                          </svg>
                          {p.eventDate}
                        </span>
                      )}
                      {p.guests && (
                        <span className="flex items-center gap-1.5">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                          </svg>
                          {p.guests} guests
                        </span>
                      )}
                      {p.viewedCount > 0 && (
                        <span className="flex items-center gap-1.5 text-amber-600">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Viewed {p.viewedCount}x
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatRelativeTime(new Date(p.createdAt).getTime() / 1000)}
                      </span>
                    </div>

                    {/* Status progress tracker */}
                    <ProposalStatusTracker status={p.status} />
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {amountDisplay && (
                      <p className="text-xl font-bold text-gray-900">{amountDisplay}</p>
                    )}
                    {p.proposalUrl && (
                      <a
                        href={p.proposalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                        View Proposal
                      </a>
                    )}
                    {!p.proposalUrl && p.status === 'draft' && (
                      <span className="text-xs text-gray-400 italic">
                        Awaiting sales team
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
