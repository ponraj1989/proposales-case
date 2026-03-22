'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  formatCurrency,
  cn,
} from '@proposales/ui';
import { useProposals, useContent, useCompanies } from '@/lib/hooks';

const STATUS_PALETTE: Record<string, { color: string; gradient: string; bg: string }> = {
  accepted: { color: '#10b981', gradient: 'from-emerald-500 to-teal-400', bg: 'bg-emerald-50' },
  active: { color: '#6366f1', gradient: 'from-indigo-500 to-blue-400', bg: 'bg-indigo-50' },
  draft: { color: '#94a3b8', gradient: 'from-slate-400 to-gray-300', bg: 'bg-slate-50' },
  expired: { color: '#f59e0b', gradient: 'from-amber-500 to-yellow-400', bg: 'bg-amber-50' },
  rejected: { color: '#ef4444', gradient: 'from-red-500 to-rose-400', bg: 'bg-red-50' },
  template: { color: '#8b5cf6', gradient: 'from-violet-500 to-purple-400', bg: 'bg-violet-50' },
  withdrawn: { color: '#64748b', gradient: 'from-slate-500 to-gray-400', bg: 'bg-slate-50' },
  replaced: { color: '#a1a1aa', gradient: 'from-zinc-400 to-gray-300', bg: 'bg-zinc-50' },
};

const CHART_COLORS = {
  primary: '#6366f1',
  success: '#10b981',
  secondary: '#8b5cf6',
  info: '#06b6d4',
  danger: '#ef4444',
};

// Gradient Donut Chart
function GradientDonut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, b) => a + b.value, 0) || 1;
  let cumulative = 0;
  const r = 42;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-8">
      <div className="relative flex-shrink-0" style={{ width: 200, height: 200 }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90 drop-shadow-lg">
          <defs>
            {segments.map((seg, i) => (
              <linearGradient key={`grad-${i}`} id={`donut-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={seg.color} stopOpacity="1" />
                <stop offset="100%" stopColor={seg.color} stopOpacity="0.6" />
              </linearGradient>
            ))}
          </defs>
          {segments.map((seg, i) => {
            const pct = (seg.value / total) * 100;
            const dashLen = (pct / 100) * circumference;
            const offset = -(cumulative / 100) * circumference;
            cumulative += pct;
            return (
              <circle
                key={i}
                cx="50" cy="50" r={r}
                fill="none"
                stroke={`url(#donut-grad-${i})`}
                strokeWidth="14"
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-gray-900">{total}</span>
          <span className="text-xs font-medium text-gray-400">proposals</span>
        </div>
      </div>
      <div className="space-y-2">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="h-3.5 w-3.5 rounded-full shadow-sm" style={{ backgroundColor: seg.color }} />
            <span className="text-sm text-gray-600 capitalize min-w-[70px]">{seg.label}</span>
            <span className="text-sm font-bold text-gray-900">{seg.value}</span>
            <span className="text-xs text-gray-400">({Math.round((seg.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Gradient Bar Chart
function GradientBarChart({ data }: { data: { label: string; value: number; gradient: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((item, i) => {
        const pct = (item.value / max) * 100;
        return (
          <div key={i} className="group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700 capitalize">{item.label}</span>
              <span className="text-sm font-bold text-gray-900">{item.value}</span>
            </div>
            <div className="h-4 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700 group-hover:shadow-lg', item.gradient)}
                style={{ width: `${Math.max(pct, 3)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Sparkline with colored area
function ColorSparkline({ data, color = CHART_COLORS.primary, height = 80 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return <div className="text-center text-xs text-gray-400 py-4">Not enough data</div>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 400;
  const h = height;
  const padding = 4;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * (w - padding * 2) + padding},${h - padding - ((v - min) / range) * (h - padding * 2)}`)
    .join(' ');
  const gradId = `spark-fill-${color.replace('#', '')}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline fill={`url(#${gradId})`} strokeWidth="0" points={`${padding},${h - padding} ${points} ${w - padding},${h - padding}`} />
      <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

// Funnel
function GradientFunnel({ stages }: { stages: { label: string; count: number; gradient: string }[] }) {
  const maxCount = stages[0]?.count || 1;
  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const pct = Math.max((stage.count / maxCount) * 100, 15);
        const convRate = i > 0 && stages[i - 1].count > 0
          ? Math.round((stage.count / stages[i - 1].count) * 100)
          : 100;
        return (
          <div key={i} className="flex items-center gap-4">
            <span className="w-24 text-sm font-medium text-gray-600 text-right">{stage.label}</span>
            <div className="flex-1 flex justify-center">
              <div
                className={cn('h-12 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-lg bg-gradient-to-r transition-all duration-500', stage.gradient)}
                style={{ width: `${pct}%` }}
              >
                {stage.count}
              </div>
            </div>
            <div className="w-16 text-right">
              {i > 0 ? (
                <span className={cn('text-xs font-bold', convRate >= 50 ? 'text-emerald-600' : convRate >= 25 ? 'text-amber-600' : 'text-red-500')}>
                  {convRate}%
                </span>
              ) : (
                <span className="text-xs text-gray-400">100%</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Progress Ring
function ProgressRing({ value, max = 100, color, label, size = 100 }: { value: number; max?: number; color: string; label: string; size?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-black" style={{ color }}>{Math.round(pct)}%</span>
        </div>
      </div>
      <span className="text-xs font-medium text-gray-500">{label}</span>
    </div>
  );
}

// Analytics Page
export default function AnalyticsPage() {
  const { data: proposalData } = useProposals();
  const { data: contentData } = useContent();
  const { data: companyData } = useCompanies();
  const [tab, setTab] = useState<'overview' | 'pipeline' | 'performance'>('overview');

  const proposals: Record<string, unknown>[] = proposalData?.data
    ? Array.isArray(proposalData.data) ? proposalData.data : [proposalData.data]
    : [];
  const content: unknown[] = contentData?.data
    ? Array.isArray(contentData.data) ? contentData.data : []
    : [];
  const companies: unknown[] = companyData?.data
    ? Array.isArray(companyData.data) ? companyData.data : []
    : [];

  const analytics = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    let totalValue = 0;
    let acceptedValue = 0;
    let viewedValue = 0;
    let currency = 'EUR';
    const monthlyData: Record<string, { count: number; value: number; accepted: number }> = {};

    for (const p of proposals) {
      const status = (p.status as string) ?? 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      const val = (p.value_with_tax as number) || 0;
      totalValue += val;
      if (status === 'accepted') acceptedValue += val;
      if ((p.viewed_count as number) > 0) viewedValue += val;
      if (p.currency) currency = p.currency as string;

      const ts = (p.updated_at as number) || (p.created_at as number);
      if (ts) {
        const d = new Date(ts * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[key]) monthlyData[key] = { count: 0, value: 0, accepted: 0 };
        monthlyData[key].count++;
        monthlyData[key].value += val;
        if (status === 'accepted') monthlyData[key].accepted++;
      }
    }

    const sent = proposals.filter((p) => p.status !== 'draft' && p.status !== 'template');
    const viewed = proposals.filter((p) => (p.viewed_count as number) > 0);
    const accepted = statusCounts['accepted'] || 0;
    const rejected = statusCounts['rejected'] || 0;

    const sortedMonths = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);

    return {
      statusCounts,
      totalValue,
      acceptedValue,
      viewedValue,
      currency,
      totalProposals: proposals.length,
      sentCount: sent.length,
      viewedCount: viewed.length,
      acceptedCount: accepted,
      rejectedCount: rejected,
      winRate: sent.length > 0 ? Math.round((accepted / sent.length) * 100) : 0,
      viewRate: sent.length > 0 ? Math.round((viewed.length / sent.length) * 100) : 0,
      avgValue: proposals.length > 0 ? Math.round(totalValue / proposals.length) : 0,
      monthlyTrend: sortedMonths.map(([, v]) => v.count),
      monthlyValues: sortedMonths.map(([, v]) => v.value),
      monthlyAccepted: sortedMonths.map(([, v]) => v.accepted),
      monthLabels: sortedMonths.map(([k]) => k),
      contentCount: content.length,
      companyCount: companies.length,
    };
  }, [proposals, content, companies]);

  const donutSegments = Object.entries(analytics.statusCounts).map(([label, value]) => ({
    label,
    value,
    color: STATUS_PALETTE[label]?.color ?? '#9ca3af',
  }));

  const barData = Object.entries(analytics.statusCounts).map(([label, value]) => ({
    label,
    value,
    gradient: STATUS_PALETTE[label]?.gradient ?? 'from-gray-400 to-gray-300',
  }));

  const funnelStages = [
    { label: 'Created', count: analytics.totalProposals, gradient: 'from-indigo-500 to-blue-500' },
    { label: 'Sent', count: analytics.sentCount, gradient: 'from-sky-500 to-cyan-400' },
    { label: 'Viewed', count: analytics.viewedCount, gradient: 'from-amber-500 to-yellow-400' },
    { label: 'Accepted', count: analytics.acceptedCount, gradient: 'from-emerald-500 to-green-400' },
  ];

  const tabs = [
    { key: 'overview', label: 'Overview', icon: '\u{1F4CA}' },
    { key: 'pipeline', label: 'Pipeline', icon: '\u{1F504}' },
    { key: 'performance', label: 'Performance', icon: '\u{1F680}' },
  ] as const;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Analytics"
          description="Visual insights into your proposal pipeline and sales performance"
        />
        <Link
          href="/dashboard/ai"
          className="group relative inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5"
        >
          <span className="text-lg">{'\u2728'}</span>
          <span>Ask AI for Insights</span>
          <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 w-fit shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all',
              tab === t.key
                ? 'bg-gradient-to-r from-gray-900 to-gray-800 text-white shadow-md'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
            )}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[
              { label: 'Total Proposals', value: analytics.totalProposals, gradient: 'from-indigo-500 to-blue-600', icon: '\u{1F4C4}' },
              { label: 'Pipeline Value', value: formatCurrency(analytics.totalValue, analytics.currency), gradient: 'from-violet-500 to-purple-600', icon: '\u{1F48E}' },
              { label: 'Won Value', value: formatCurrency(analytics.acceptedValue, analytics.currency), gradient: 'from-emerald-500 to-teal-600', icon: '\u{1F3C6}' },
              { label: 'Win Rate', value: `${analytics.winRate}%`, gradient: 'from-amber-500 to-orange-600', icon: '\u{1F4C8}' },
              { label: 'Avg. Value', value: formatCurrency(analytics.avgValue, analytics.currency), gradient: 'from-pink-500 to-rose-600', icon: '\u{1F4B0}' },
            ].map((item) => (
              <div key={item.label} className={cn('rounded-2xl bg-gradient-to-br p-5 text-white shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl', item.gradient)}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase opacity-80">{item.label}</p>
                  <span className="text-xl">{item.icon}</span>
                </div>
                <p className="mt-2 text-2xl font-black">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="shadow-lg border-0 ring-1 ring-gray-100">
              <CardHeader><CardTitle className="flex items-center gap-2"><span className="text-lg">{'\u{1F3AF}'}</span> Status Distribution</CardTitle></CardHeader>
              <CardContent><GradientDonut segments={donutSegments} /></CardContent>
            </Card>
            <Card className="shadow-lg border-0 ring-1 ring-gray-100">
              <CardHeader><CardTitle className="flex items-center gap-2"><span className="text-lg">{'\u{1F4C8}'}</span> Monthly Activity</CardTitle></CardHeader>
              <CardContent>
                <ColorSparkline data={analytics.monthlyTrend} color={CHART_COLORS.primary} />
                <div className="mt-2 flex justify-between text-xs font-medium text-gray-400">
                  <span>{analytics.monthLabels[0] ?? ''}</span>
                  <span>{analytics.monthLabels[analytics.monthLabels.length - 1] ?? ''}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Content Items', value: analytics.contentCount, color: 'text-indigo-600' },
              { label: 'Companies', value: analytics.companyCount, color: 'text-violet-600' },
              { label: 'Viewed', value: analytics.viewedCount, color: 'text-amber-600' },
              { label: 'Rejected', value: analytics.rejectedCount, color: 'text-red-500' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase">{s.label}</p>
                <p className={cn('mt-1 text-2xl font-black', s.color)}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Tab */}
      {tab === 'pipeline' && (
        <div className="space-y-6">
          <Card className="shadow-lg border-0 ring-1 ring-gray-100">
            <CardHeader><CardTitle className="flex items-center gap-2"><span className="text-lg">{'\u{1F504}'}</span> Proposal Pipeline Funnel</CardTitle></CardHeader>
            <CardContent><GradientFunnel stages={funnelStages} /></CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="shadow-lg border-0 ring-1 ring-gray-100">
              <CardHeader><CardTitle className="flex items-center gap-2"><span className="text-lg">{'\u{1F4CA}'}</span> Status Breakdown</CardTitle></CardHeader>
              <CardContent><GradientBarChart data={barData} /></CardContent>
            </Card>
            <Card className="shadow-lg border-0 ring-1 ring-gray-100">
              <CardHeader><CardTitle className="flex items-center gap-2"><span className="text-lg">{'\u{1F4B0}'}</span> Revenue Trend</CardTitle></CardHeader>
              <CardContent>
                <ColorSparkline data={analytics.monthlyValues} color={CHART_COLORS.success} height={100} />
                <div className="mt-2 flex justify-between text-xs font-medium text-gray-400">
                  <span>{analytics.monthLabels[0] ?? ''}</span>
                  <span>{analytics.monthLabels[analytics.monthLabels.length - 1] ?? ''}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {['draft', 'active', 'accepted', 'rejected', 'expired'].map((stage) => {
              const count = analytics.statusCounts[stage] || 0;
              const palette = STATUS_PALETTE[stage] || STATUS_PALETTE.draft;
              return (
                <div key={stage} className={cn('rounded-2xl border-2 p-5 text-center transition-all hover:-translate-y-1 hover:shadow-lg', palette.bg)} style={{ borderColor: palette.color }}>
                  <p className="text-4xl font-black" style={{ color: palette.color }}>{count}</p>
                  <p className="mt-1 text-sm font-semibold capitalize text-gray-600">{stage === 'active' ? 'Sent' : stage}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Performance Tab */}
      {tab === 'performance' && (
        <div className="space-y-6">
          <Card className="shadow-lg border-0 ring-1 ring-gray-100">
            <CardHeader><CardTitle className="flex items-center gap-2"><span className="text-lg">{'\u{1F3AF}'}</span> Conversion Metrics</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center justify-center gap-8">
                <ProgressRing value={analytics.winRate} color={CHART_COLORS.success} label="Win Rate" size={120} />
                <ProgressRing value={analytics.viewRate} color={CHART_COLORS.info} label="View Rate" size={120} />
                <ProgressRing value={analytics.sentCount > 0 ? Math.round((analytics.rejectedCount / analytics.sentCount) * 100) : 0} color={CHART_COLORS.danger} label="Rejection Rate" size={120} />
                <ProgressRing value={analytics.totalProposals > 0 ? Math.round((analytics.sentCount / analytics.totalProposals) * 100) : 0} color={CHART_COLORS.primary} label="Send Rate" size={120} />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="shadow-lg border-0 ring-1 ring-gray-100">
              <CardHeader><CardTitle className="flex items-center gap-2"><span className="text-lg">{'\u2705'}</span> Monthly Accepted</CardTitle></CardHeader>
              <CardContent>
                <ColorSparkline data={analytics.monthlyAccepted} color={CHART_COLORS.success} />
                <div className="mt-2 flex justify-between text-xs font-medium text-gray-400">
                  <span>{analytics.monthLabels[0] ?? ''}</span>
                  <span>{analytics.monthLabels[analytics.monthLabels.length - 1] ?? ''}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-lg border-0 ring-1 ring-gray-100">
              <CardHeader><CardTitle className="flex items-center gap-2"><span className="text-lg">{'\u{1F4C9}'}</span> Activity Trend</CardTitle></CardHeader>
              <CardContent>
                <ColorSparkline data={analytics.monthlyTrend} color={CHART_COLORS.secondary} />
                <div className="mt-2 flex justify-between text-xs font-medium text-gray-400">
                  <span>{analytics.monthLabels[0] ?? ''}</span>
                  <span>{analytics.monthLabels[analytics.monthLabels.length - 1] ?? ''}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-lg border-0 ring-1 ring-gray-100">
            <CardHeader><CardTitle className="flex items-center gap-2"><span className="text-lg">{'\u{1F4A1}'}</span> Improvement Suggestions</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.winRate < 50 && (
                  <div className="flex gap-3 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4">
                    <span className="text-2xl">{'\u26A0\uFE0F'}</span>
                    <div>
                      <p className="text-sm font-bold text-amber-800">Low Win Rate ({analytics.winRate}%)</p>
                      <p className="text-xs text-amber-600">Review your proposal templates and pricing strategy. Use the AI assistant for personalized suggestions.</p>
                    </div>
                  </div>
                )}
                {analytics.rejectedCount > analytics.acceptedCount && (
                  <div className="flex gap-3 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-4">
                    <span className="text-2xl">{'\u{1F6A8}'}</span>
                    <div>
                      <p className="text-sm font-bold text-red-800">High Rejection Rate</p>
                      <p className="text-xs text-red-600">More proposals are being rejected than accepted. Review common objections and adjust your approach.</p>
                    </div>
                  </div>
                )}
                {analytics.viewRate < 60 && analytics.sentCount > 0 && (
                  <div className="flex gap-3 rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 p-4">
                    <span className="text-2xl">{'\u{1F441}\uFE0F'}</span>
                    <div>
                      <p className="text-sm font-bold text-cyan-800">Low View Rate ({analytics.viewRate}%)</p>
                      <p className="text-xs text-cyan-600">{"Many proposals aren't being viewed. Consider following up via email or phone."}</p>
                    </div>
                  </div>
                )}
                <Link
                  href="/dashboard/ai"
                  className="flex gap-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 p-4 transition-all hover:shadow-md hover:-translate-y-0.5 group"
                >
                  <span className="text-2xl">{'\u2728'}</span>
                  <div>
                    <p className="text-sm font-bold text-indigo-800 group-hover:text-indigo-900">Ask AI for Deeper Insights</p>
                    <p className="text-xs text-indigo-600">Get custom analytics queries, pricing optimization, trend analysis, and actionable recommendations.</p>
                  </div>
                  <svg className="h-5 w-5 text-indigo-400 self-center transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
