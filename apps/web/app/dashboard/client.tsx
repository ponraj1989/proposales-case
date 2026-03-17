'use client';

import { useMemo } from 'react';
import {
  PageHeader,
  StatCard,
  DataTable,
  StatusBadge,
  formatCurrency,
  formatRelativeTime,
  type Column,
} from '@proposales/ui';
import type { Proposal, ProposalSearchResult, Content, Company } from '@proposales/api-client';
import { useRouter } from 'next/navigation';

// ─── Mini Chart Components (no recharts dependency for dashboard) ───
function MiniBar({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((v, i) => (
        <div
          key={i}
          className="w-3 rounded-t transition-all"
          style={{ height: `${(v / max) * 100}%`, backgroundColor: color, minHeight: 2 }}
        />
      ))}
    </div>
  );
}

// ─── Stats Calculation ───
interface DashboardStats {
  totalProposals: number;
  totalValue: number;
  acceptedCount: number;
  winRate: number;
  activeCount: number;
  draftCount: number;
  contentCount: number;
  companyCount: number;
  currency: string;
  statusCounts: Record<string, number>;
  recentProposals: Record<string, unknown>[];
}

function computeStats(
  proposals: Record<string, unknown>[],
  content: unknown[],
  companies: unknown[],
): DashboardStats {
  const statusCounts: Record<string, number> = {};
  let totalValue = 0;
  let currency = 'USD';

  for (const p of proposals) {
    const st = (p.status as string) ?? 'unknown';
    statusCounts[st] = (statusCounts[st] || 0) + 1;
    totalValue += (p.value_with_tax as number) || 0;
    if (p.currency) currency = p.currency as string;
  }

  const acceptedCount = statusCounts['accepted'] || 0;
  const sentProposals = proposals.filter((p) => p.status !== 'draft' && p.status !== 'template');

  return {
    totalProposals: proposals.length,
    totalValue,
    acceptedCount,
    winRate: sentProposals.length > 0 ? Math.round((acceptedCount / sentProposals.length) * 100) : 0,
    activeCount: statusCounts['active'] || 0,
    draftCount: statusCounts['draft'] || 0,
    contentCount: content.length,
    companyCount: companies.length,
    currency,
    statusCounts,
    recentProposals: [...proposals]
      .sort((a, b) => ((b.updated_at as number) || 0) - ((a.updated_at as number) || 0))
      .slice(0, 10),
  };
}

// ─── Dashboard Client ───
export function DashboardClient({
  proposals,
  content,
  companies,
  error,
}: {
  proposals: unknown[];
  content: unknown[];
  companies: unknown[];
  error: string | null;
}) {
  const router = useRouter();
  const stats = useMemo(
    () => computeStats(proposals as Record<string, unknown>[], content, companies),
    [proposals, content, companies],
  );

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-card border border-error-200 bg-error-50 p-6">
          <p className="text-sm font-medium text-error-700">{error}</p>
          <p className="mt-1 text-xs text-error-500">
            Check your API credentials in the environment variables.
          </p>
        </div>
      </div>
    );
  }

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'title',
      header: 'Proposal',
      render: (item) => (
        <div>
          <p className="font-medium text-gray-900">{(item.title_md || item.title || 'Untitled') as string}</p>
          <p className="text-xs text-gray-400">{(item.uuid as string)?.slice(0, 8)}...</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => <StatusBadge status={item.status as string} />,
    },
    {
      key: 'value_with_tax',
      header: 'Value',
      render: (item) => (
        <span className="font-medium">
          {formatCurrency((item.value_with_tax as number) || 0, stats.currency)}
        </span>
      ),
    },
    {
      key: 'contact_name',
      header: 'Contact',
      render: (item) => (
        <span className="text-gray-600">{(item.contact_name || item.recipient_name || '—') as string}</span>
      ),
    },
    {
      key: 'updated_at',
      header: 'Updated',
      render: (item) =>
        item.updated_at ? (
          <span className="text-gray-500">{formatRelativeTime(item.updated_at as number)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
  ];

  const statusData = Object.entries(stats.statusCounts).map(([k, v]) => v);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your proposal pipeline and key metrics"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Total Proposals</p>
            <div className="rounded-lg bg-brand-50 p-2">
              <svg className="h-5 w-5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.totalProposals}</p>
          <p className="mt-1 text-sm text-gray-500">{stats.activeCount} active, {stats.draftCount} drafts</p>
        </div>

        <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Pipeline Value</p>
            <div className="rounded-lg bg-success-50 p-2">
              <svg className="h-5 w-5 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {formatCurrency(stats.totalValue, stats.currency)}
          </p>
          <p className="mt-1 text-sm text-success-600">
            {stats.acceptedCount} accepted
          </p>
        </div>

        <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Win Rate</p>
            <div className="rounded-lg bg-warning-50 p-2">
              <svg className="h-5 w-5 text-warning-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a13.507 13.507 0 01-3.032 1.078 13.507 13.507 0 01-3.032-1.078" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.winRate}%</p>
          <MiniBar data={statusData.length > 0 ? statusData : [0]} color="#4461D7" />
        </div>

        <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Resources</p>
            <div className="rounded-lg bg-brand-50 p-2">
              <svg className="h-5 w-5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.contentCount}</p>
          <p className="mt-1 text-sm text-gray-500">{stats.companyCount} companies</p>
        </div>
      </div>

      {/* Status Distribution */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1 rounded-card border border-gray-200 bg-white p-6 shadow-card">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Status Distribution
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.statusCounts).map(([status, count]) => {
              const pct = stats.totalProposals > 0 ? Math.round((count / stats.totalProposals) * 100) : 0;
              const colors: Record<string, string> = {
                accepted: 'bg-success-500',
                active: 'bg-brand-500',
                draft: 'bg-gray-400',
                expired: 'bg-warning-500',
                rejected: 'bg-error-500',
                template: 'bg-brand-300',
              };
              return (
                <div key={status}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize text-gray-700">{status}</span>
                    <span className="font-medium text-gray-900">{count} ({pct}%)</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                    <div
                      className={`h-2 rounded-full ${colors[status] ?? 'bg-gray-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Proposals Table */}
        <div className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Recent Proposals
            </h3>
            <button
              onClick={() => router.push('/dashboard/proposals')}
              className="text-sm font-medium text-brand-500 hover:text-brand-600"
            >
              View all →
            </button>
          </div>
          <DataTable
            columns={columns}
            data={stats.recentProposals}
            keyExtractor={(item) => item.uuid as string}
            onRowClick={(item) => router.push(`/dashboard/proposals/${item.uuid}`)}
            emptyMessage="No proposals yet. Create your first proposal!"
          />
        </div>
      </div>
    </div>
  );
}
