'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
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
import { cn } from '@proposales/ui';

// ─── Animated Counter ───
function AnimatedCounter({
  target,
  duration = 1200,
  prefix = '',
  suffix = '',
  decimals = 0,
}: {
  target: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const ease = 1 - Math.pow(1 - progress, 3);
            setCount(ease * target);
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  const formatted =
    decimals > 0
      ? count.toFixed(decimals)
      : Math.round(count).toLocaleString();

  return (
    <span ref={ref}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

// ─── Mini Donut (SVG) ───
function MiniDonut({
  data,
  colors,
  size = 80,
}: {
  data: { label: string; value: number }[];
  colors: string[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width={size} height={size} className="dash-donut">
      {data.map((d, i) => {
        const pct = d.value / total;
        const dashLen = pct * circ;
        const dashOffset = -offset * circ;
        offset += pct;
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colors[i % colors.length]}
            strokeWidth={6}
            strokeDasharray={`${dashLen} ${circ - dashLen}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-700"
            style={{ animationDelay: `${i * 120 + 400}ms` }}
          />
        );
      })}
    </svg>
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
  let currency = 'EUR';

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

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your proposal pipeline and key metrics"
      />

      {/* KPI Card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="dash-card-enter rounded-card border border-gray-200 bg-white p-6 shadow-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300" style={{ animationDelay: '0ms' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Total Proposals</p>
            <div className="rounded-lg bg-gray-100 p-2">
              <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            <AnimatedCounter target={stats.totalProposals} />
          </p>
          <p className="mt-1 text-sm text-gray-500">{stats.activeCount} active, {stats.draftCount} drafts</p>
        </div>
      </div>

      {/* Status Distribution & Recent Proposals */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="dash-card-enter xl:col-span-1 rounded-card border border-gray-200 bg-white p-6 shadow-card" style={{ animationDelay: '320ms' }}>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Status Distribution
          </h3>
          {/* Donut overview */}
          <div className="flex items-center justify-center mb-5">
            <div className="relative">
              <MiniDonut
                data={Object.entries(stats.statusCounts).map(([label, value]) => ({ label, value }))}
                colors={Object.keys(stats.statusCounts).map(
                  (s) =>
                    ({
                      accepted: '#22c55e',
                      active: '#171717',
                      draft: '#9ca3af',
                      expired: '#f59e0b',
                      rejected: '#ef4444',
                      template: '#737373',
                    })[s] ?? '#9ca3af',
                )}
                size={90}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-gray-900">{stats.totalProposals}</span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {Object.entries(stats.statusCounts).map(([status, count], idx) => {
              const pct = stats.totalProposals > 0 ? Math.round((count / stats.totalProposals) * 100) : 0;
              const colors: Record<string, string> = {
                accepted: 'bg-success-500',
                active: 'bg-gray-900',
                draft: 'bg-gray-400',
                expired: 'bg-warning-500',
                rejected: 'bg-error-500',
                template: 'bg-gray-500',
              };
              return (
                <div key={status} className="dash-row-enter" style={{ animationDelay: `${400 + idx * 60}ms` }}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize text-gray-700">{status}</span>
                    <span className="font-medium text-gray-900">{count} ({pct}%)</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={cn('dash-progress-bar h-2 rounded-full', colors[status] ?? 'bg-gray-400')}
                      style={{ '--bar-width': `${pct}%` } as React.CSSProperties}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Proposals Table */}
        <div className="xl:col-span-2 dash-card-enter" style={{ animationDelay: '380ms' }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Recent Proposals
            </h3>
            <button
              onClick={() => router.push('/dashboard/proposals')}
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
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
