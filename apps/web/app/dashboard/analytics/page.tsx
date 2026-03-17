'use client';

import { useMemo, useState } from 'react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  formatCurrency,
  cn,
} from '@proposales/ui';
import { useProposals, useContent, useCompanies } from '@/lib/hooks';

// Simple chart components (no external deps)
function BarChart({ data, labelKey, valueKey, color = '#4461D7' }: {
  data: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div className="space-y-2">
      {data.map((item, i) => {
        const val = Number(item[valueKey]) || 0;
        const pct = (val / max) * 100;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-24 text-right text-xs text-gray-600 capitalize truncate">
              {String(item[labelKey])}
            </span>
            <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-12 text-xs font-medium text-gray-700 tabular-nums text-right">{val}</span>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, b) => a + b.value, 0) || 1;
  let cumulative = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-40 w-40 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          {segments.map((seg, i) => {
            const pct = (seg.value / total) * 100;
            const offset = cumulative;
            cumulative += pct;
            return (
              <circle
                key={i}
                cx="50" cy="50" r="40"
                fill="none"
                stroke={seg.color}
                strokeWidth="12"
                strokeDasharray={`${pct * 2.51327} ${251.327 - pct * 2.51327}`}
                strokeDashoffset={`${-offset * 2.51327}`}
                className="transition-all duration-500"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{total}</span>
          <span className="text-xs text-gray-500">Total</span>
        </div>
      </div>
      <div className="space-y-2">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-sm text-gray-700 capitalize">{seg.label}</span>
            <span className="text-sm font-medium text-gray-900">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SparklineChart({ data, color = '#4461D7' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 200;
  const h = 60;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
      <polyline
        fill={`${color}20`}
        strokeWidth="0"
        points={`0,${h} ${points} ${w},${h}`}
      />
    </svg>
  );
}

// ─── Analytics Page ───
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
    let currency = 'USD';
    const monthlyData: Record<string, { count: number; value: number }> = {};

    for (const p of proposals) {
      const status = (p.status as string) ?? 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      const val = (p.value_with_tax as number) || 0;
      totalValue += val;
      if (status === 'accepted') acceptedValue += val;
      if (p.currency) currency = p.currency as string;

      // Monthly grouping
      const ts = (p.updated_at as number) || (p.created_at as number);
      if (ts) {
        const d = new Date(ts * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[key]) monthlyData[key] = { count: 0, value: 0 };
        monthlyData[key].count++;
        monthlyData[key].value += val;
      }
    }

    const sent = proposals.filter((p) => p.status !== 'draft' && p.status !== 'template');
    const accepted = statusCounts['accepted'] || 0;
    const rejected = statusCounts['rejected'] || 0;

    const sortedMonths = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);

    return {
      statusCounts,
      totalValue,
      acceptedValue,
      currency,
      totalProposals: proposals.length,
      sentCount: sent.length,
      acceptedCount: accepted,
      rejectedCount: rejected,
      winRate: sent.length > 0 ? Math.round((accepted / sent.length) * 100) : 0,
      avgValue: proposals.length > 0 ? Math.round(totalValue / proposals.length) : 0,
      monthlyTrend: sortedMonths.map(([, v]) => v.count),
      monthlyValues: sortedMonths.map(([, v]) => v.value),
      monthLabels: sortedMonths.map(([k]) => k),
      statusBarData: Object.entries(statusCounts).map(([label, value]) => ({ label, value })),
      contentCount: content.length,
      companyCount: companies.length,
    };
  }, [proposals, content, companies]);

  const statusColors: Record<string, string> = {
    accepted: '#22c55e',
    active: '#4461D7',
    draft: '#9ca3af',
    expired: '#f59e0b',
    rejected: '#ef4444',
    template: '#8b9cf7',
    withdrawn: '#6b7280',
    replaced: '#a1a1aa',
  };

  const donutSegments = Object.entries(analytics.statusCounts).map(([label, value]) => ({
    label,
    value,
    color: statusColors[label] ?? '#9ca3af',
  }));

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'performance', label: 'Performance' },
  ] as const;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Analytics"
        description="Visual insights into your proposal pipeline and sales performance"
      />

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'bg-brand-500 text-white'
                : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[
              { label: 'Total Proposals', value: analytics.totalProposals },
              { label: 'Pipeline Value', value: formatCurrency(analytics.totalValue, analytics.currency) },
              { label: 'Won Value', value: formatCurrency(analytics.acceptedValue, analytics.currency) },
              { label: 'Win Rate', value: `${analytics.winRate}%` },
              { label: 'Avg. Value', value: formatCurrency(analytics.avgValue, analytics.currency) },
            ].map((item) => (
              <div key={item.label} className="rounded-card border border-gray-200 bg-white p-5 shadow-card">
                <p className="text-xs font-medium text-gray-500 uppercase">{item.label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart segments={donutSegments} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <SparklineChart data={analytics.monthlyTrend} />
                <div className="mt-4 flex justify-between text-xs text-gray-400">
                  <span>{analytics.monthLabels[0] ?? ''}</span>
                  <span>{analytics.monthLabels[analytics.monthLabels.length - 1] ?? ''}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Pipeline Tab */}
      {tab === 'pipeline' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Proposal Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 mb-6">
                {['draft', 'active', 'accepted', 'rejected', 'expired'].map((stage) => {
                  const count = analytics.statusCounts[stage] || 0;
                  return (
                    <div
                      key={stage}
                      className="flex-1 min-w-[140px] rounded-lg border-2 p-4 text-center"
                      style={{ borderColor: statusColors[stage] }}
                    >
                      <p className="text-3xl font-bold" style={{ color: statusColors[stage] }}>
                        {count}
                      </p>
                      <p className="text-sm capitalize text-gray-600">{stage}</p>
                    </div>
                  );
                })}
              </div>

              {/* Funnel visualization */}
              <div className="space-y-2">
                {[
                  { label: 'Created', count: analytics.totalProposals, color: '#4461D7' },
                  { label: 'Sent', count: analytics.sentCount, color: '#8b9cf7' },
                  { label: 'Accepted', count: analytics.acceptedCount, color: '#22c55e' },
                ].map((stage, i) => {
                  const pct = analytics.totalProposals > 0 ? (stage.count / analytics.totalProposals) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <span className="w-20 text-sm text-gray-600">{stage.label}</span>
                      <div className="flex-1 flex justify-center">
                        <div
                          className="h-10 rounded-lg flex items-center justify-center text-white text-sm font-medium transition-all"
                          style={{
                            width: `${Math.max(pct, 10)}%`,
                            backgroundColor: stage.color,
                          }}
                        >
                          {stage.count}
                        </div>
                      </div>
                      <span className="w-12 text-right text-xs text-gray-500">{Math.round(pct)}%</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <SparklineChart data={analytics.monthlyValues} color="#22c55e" />
              <div className="mt-4 flex justify-between text-xs text-gray-400">
                <span>{analytics.monthLabels[0] ?? ''}</span>
                <span>{analytics.monthLabels[analytics.monthLabels.length - 1] ?? ''}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Performance Tab */}
      {tab === 'performance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={analytics.statusBarData}
                  labelKey="label"
                  valueKey="value"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversion Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Win Rate</span>
                      <span className="text-sm font-medium text-gray-900">{analytics.winRate}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-success-500 rounded-full transition-all"
                        style={{ width: `${analytics.winRate}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Rejection Rate</span>
                      <span className="text-sm font-medium text-gray-900">
                        {analytics.sentCount > 0 ? Math.round((analytics.rejectedCount / analytics.sentCount) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-error-500 rounded-full transition-all"
                        style={{ width: `${analytics.sentCount > 0 ? (analytics.rejectedCount / analytics.sentCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Content Items</p>
                      <p className="text-xl font-bold text-gray-900">{analytics.contentCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Companies</p>
                      <p className="text-xl font-bold text-gray-900">{analytics.companyCount}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Improvement Suggestions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.winRate < 50 && (
                  <div className="flex gap-3 rounded-lg border border-warning-200 bg-warning-50 p-4">
                    <span className="text-warning-500">⚠</span>
                    <div>
                      <p className="text-sm font-medium text-warning-800">Low Win Rate ({analytics.winRate}%)</p>
                      <p className="text-xs text-warning-600">Consider reviewing your proposal templates and pricing strategy. Use the AI assistant for personalized suggestions.</p>
                    </div>
                  </div>
                )}
                {analytics.rejectedCount > analytics.acceptedCount && (
                  <div className="flex gap-3 rounded-lg border border-error-200 bg-error-50 p-4">
                    <span className="text-error-500">✕</span>
                    <div>
                      <p className="text-sm font-medium text-error-800">High Rejection Rate</p>
                      <p className="text-xs text-error-600">More proposals are being rejected than accepted. Review common objections and adjust your approach.</p>
                    </div>
                  </div>
                )}
                {analytics.statusCounts['expired'] > 3 && (
                  <div className="flex gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <span className="text-gray-500">⏰</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Expired Proposals</p>
                      <p className="text-xs text-gray-600">You have {analytics.statusCounts['expired']} expired proposals. Consider following up with clients or adjusting expiry timelines.</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
                  <span className="text-brand-500">💡</span>
                  <div>
                    <p className="text-sm font-medium text-brand-800">Use AI for Deeper Insights</p>
                    <p className="text-xs text-brand-600">Ask the AI Assistant for detailed analysis, pricing optimization, and improvement recommendations.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
