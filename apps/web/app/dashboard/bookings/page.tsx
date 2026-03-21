'use client';

import { useProposals } from '@/lib/hooks';
import { StatusBadge, formatCurrency, formatRelativeTime } from '@proposales/ui';

export default function BookingsPage() {
  const { data, isLoading, error } = useProposals();

  const proposals: Record<string, unknown>[] = data?.data
    ? Array.isArray(data.data) ? data.data : [data.data]
    : [];

  // Sort by updated_at descending
  const sorted = [...proposals].sort(
    (a, b) => ((b.updated_at as number) || 0) - ((a.updated_at as number) || 0),
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Proposals</h1>
        <p className="mt-1 text-sm text-gray-500">
          View your proposals and their current status
        </p>
      </div>

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
      ) : sorted.length === 0 ? (
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
          {sorted.map((p) => {
            const uuid = p.uuid as string;
            const title = (p.title as string) || (p.title_md as string) || 'Untitled Proposal';
            const status = (p.status as string) || 'unknown';
            const value = (p.value_with_tax as number) || 0;
            const currency = (p.currency as string) || 'SEK';
            const updatedAt = p.updated_at as number | undefined;
            const pData = (p.data as Record<string, unknown>) || {};
            const negotiationRound = pData.negotiation_round as number | undefined;
            const discountApplied = pData.discount_applied as number | undefined;
            const venueType = pData.venue_type as string | undefined;
            // Build e-sign URL from uuid
            const esignUrl = uuid ? `https://esign.proposales.com/v/${uuid}` : null;

            return (
              <div
                key={uuid}
                className="rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="truncate text-lg font-semibold text-gray-900">{title}</h3>
                      <StatusBadge status={status} />
                    </div>

                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
                      {venueType && (
                        <span className="flex items-center gap-1.5 capitalize">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18m16.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                          </svg>
                          {venueType}
                        </span>
                      )}
                      {negotiationRound != null && negotiationRound > 0 && (
                        <span className="flex items-center gap-1.5">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                          </svg>
                          Round {negotiationRound}
                          {discountApplied ? ` (${discountApplied}% off)` : ''}
                        </span>
                      )}
                      {updatedAt && (
                        <span className="flex items-center gap-1.5">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatRelativeTime(updatedAt)}
                        </span>
                      )}
                      <span className="font-mono text-xs text-gray-400">{uuid.slice(0, 8)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <p className="text-xl font-bold text-gray-900">
                      {formatCurrency(value, currency)}
                    </p>
                    {esignUrl && (status === 'active' || status === 'accepted') && (
                      <a
                        href={esignUrl}
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
