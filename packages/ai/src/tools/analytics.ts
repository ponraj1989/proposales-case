import { z } from 'zod';
import { tool } from 'ai';
import type { ProposalesSDK, Proposal, ProposalSearchResult } from '@proposales/api-client';

export function createAnalyzePortfolioTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'Analyze the proposal portfolio to provide sales insights. Fetches proposals, content, and company data to generate analytics. Use when the user asks about performance, trends, win rates, or wants improvement suggestions.',
    inputSchema: z.object({
      analysis_type: z
        .enum([
          'win_rate',
          'revenue',
          'content_performance',
          'pricing_analysis',
          'overview',
        ])
        .describe('What type of analysis to perform'),
    }),
    execute: async ({ analysis_type }) => {
      const [searchResult, content, companies] = await Promise.all([
        sdk.proposals.search({}, 25),
        sdk.content.list(),
        sdk.companies.list(),
      ]);

      const searchItems = Array.isArray(searchResult.data) ? searchResult.data : [searchResult.data];

      // Fetch full proposals to get value data
      const fetched = await Promise.all(
        searchItems.map(item =>
          sdk.proposals.get(item.uuid).then(r => r.data).catch(() => null)
        )
      );
      const fullProposals = fetched.filter((p): p is Proposal => p !== null);

      const stats = {
        total: fullProposals.length,
        byStatus: {} as Record<string, number>,
        totalValue: 0,
        totalValueWithTax: 0,
        companies: companies.data.length,
        contentItems: content.data.length,
        currency: fullProposals[0]?.currency ?? 'USD',
      };

      for (const p of fullProposals) {
        const status = p.status ?? 'unknown';
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
        stats.totalValue += p.value_without_tax || 0;
        stats.totalValueWithTax += p.value_with_tax || 0;
      }

      return {
        analysis_type,
        stats: {
          ...stats,
          totalValue: Math.round(stats.totalValue / 100),
          totalValueWithTax: Math.round(stats.totalValueWithTax / 100),
        },
        proposals: fullProposals.map(p => ({
          uuid: p.uuid,
          title: p.title ?? p.title_md,
          status: p.status,
          value_without_tax: p.value_without_tax,
          value_with_tax: p.value_with_tax,
          currency: p.currency,
          recipient_name: p.recipient_name,
          recipient_company_name: p.recipient_company_name,
          updated_at: p.updated_at,
          block_count: p.blocks?.length ?? 0,
        })),
        content_count: content.data.length,
        company_count: companies.data.length,
      };
    },
  });
}

const seriesSchema = z.object({
  key: z.string().describe('Data key for this series'),
  label: z.string().describe('Display label'),
  color: z.string().optional().describe('Hex color (e.g. "#4461D7")'),
  type: z.enum(['bar', 'line', 'area']).optional().describe('Series type in composed charts'),
});

const dataPointSchema = z.record(z.union([z.string(), z.number()])).describe(
  'Data point object with a name/label key and one or more numeric value keys',
);

export function createRenderChartTool() {
  return tool({
    description: `Generate rich chart / visualization config that the chat UI renders using Recharts.
Supports: bar, stacked_bar, line, area, pie, donut, radar, composed (mixed bar+line), funnel, heatmap.
For multi-series data supply a "series" array describing each series key. For single-series you can omit series and just use x_key/y_key.
Use this whenever the user asks to visualize data, compare metrics, show trends, see distributions, or create a chart/graph of any kind.`,
    inputSchema: z.object({
      chart_type: z
        .enum([
          'bar',
          'stacked_bar',
          'line',
          'area',
          'pie',
          'donut',
          'radar',
          'composed',
          'funnel',
          'heatmap',
        ])
        .describe('Type of chart to render'),
      title: z.string().describe('Chart title'),
      subtitle: z.string().optional().describe('Optional chart subtitle or description'),
      data: z.array(dataPointSchema).describe('Array of data points'),
      x_key: z.string().optional().describe('Key for X axis / category (default: "name")'),
      y_key: z.string().optional().describe('Key for Y axis (single-series, default: "value")'),
      series: z.array(seriesSchema).optional().describe('Multi-series definitions'),
      x_label: z.string().optional().describe('X axis label'),
      y_label: z.string().optional().describe('Y axis label'),
      colors: z.array(z.string()).optional().describe('Color palette for pie/donut/bars'),
      show_legend: z.boolean().optional().describe('Show legend (default: true)'),
      show_grid: z.boolean().optional().describe('Show grid lines (default: true)'),
      height: z.number().optional().describe('Chart height in px (default: 300)'),
      value_prefix: z.string().optional().describe('Prefix for values (e.g. "$")'),
      value_suffix: z.string().optional().describe('Suffix for values (e.g. "%")'),
      stacked: z.boolean().optional().describe('Stack bars/areas (default: false for bar, true for stacked_bar)'),
      insight: z.string().optional().describe('Key insight or takeaway to show below the chart'),
    }),
    execute: async (params) => {
      return {
        type: 'chart' as const,
        chart_type: params.chart_type,
        title: params.title,
        subtitle: params.subtitle,
        data: params.data,
        x_key: params.x_key ?? 'name',
        y_key: params.y_key ?? 'value',
        series: params.series,
        x_label: params.x_label,
        y_label: params.y_label,
        colors: params.colors ?? [
          '#4461D7', '#36B37E', '#FF5630', '#FFAB00', '#6554C0',
          '#00B8D9', '#FF8B00', '#57D9A3', '#8777D9', '#FFC400',
        ],
        show_legend: params.show_legend ?? true,
        show_grid: params.show_grid ?? true,
        height: params.height ?? 300,
        value_prefix: params.value_prefix ?? '',
        value_suffix: params.value_suffix ?? '',
        stacked: params.stacked ?? (params.chart_type === 'stacked_bar'),
        insight: params.insight,
      };
    },
  });
}

export function createQueryProposalDataTool(sdk: ProposalesSDK) {
  return tool({
    description: `Query and aggregate proposal data for visualization.
Fetches real proposals from the Proposales API and transforms them into chart-ready datasets.
Use BEFORE renderChart when the user asks to visualize proposal data (e.g. "show revenue by month", "compare proposals by status", "what's the trend of accepted proposals").
Returns structured data that should be passed directly to renderChart.`,
    inputSchema: z.object({
      query_type: z
        .enum([
          'status_distribution',
          'revenue_by_month',
          'proposal_count_by_month',
          'value_by_company',
          'win_rate_trend',
          'avg_value_by_status',
          'top_companies',
          'pipeline_funnel',
          'custom',
        ])
        .describe('What data aggregation to perform'),
      limit: z.number().optional().describe('Max proposals to fetch (default: 25, max: 25)'),
      group_by: z
        .string()
        .optional()
        .describe('For custom queries: field to group by (e.g. "status", "currency")'),
      metric: z
        .enum(['count', 'sum_value', 'avg_value'])
        .optional()
        .describe('For custom queries: metric to compute'),
    }),
    execute: async ({ query_type, limit, group_by, metric }) => {
      const fetchLimit = Math.min(limit ?? 25, 25);
      const needsValues = ['revenue_by_month', 'value_by_company', 'avg_value_by_status', 'custom'].includes(query_type);

      // Search for proposals (returns lightweight results: status, timestamps, title, uuid, data)
      const searchResult = await sdk.proposals.search({}, fetchLimit);
      const searchItems: ProposalSearchResult[] = Array.isArray(searchResult.data)
        ? searchResult.data
        : [searchResult.data];

      // For queries that need pricing data (value_with_tax, etc.), fetch full proposals
      let fullProposals: Proposal[] = [];
      if (needsValues && searchItems.length > 0) {
        const fetched = await Promise.all(
          searchItems.map(item =>
            sdk.proposals.get(item.uuid).then(r => r.data).catch(() => null)
          )
        );
        fullProposals = fetched.filter((p): p is Proposal => p !== null);
      }

      switch (query_type) {
        case 'status_distribution': {
          const counts: Record<string, number> = {};
          for (const p of searchItems) {
            const s = String(p.status ?? 'unknown');
            counts[s] = (counts[s] || 0) + 1;
          }
          return {
            query_type,
            suggested_chart: 'donut',
            data: Object.entries(counts).map(([name, value]) => ({ name, value })),
            total: searchItems.length,
          };
        }

        case 'revenue_by_month': {
          const monthly: Record<string, number> = {};
          for (const p of fullProposals) {
            const ts = p.updated_at || 0;
            if (!ts) continue;
            const d = new Date(ts * 1000);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthly[key] = (monthly[key] || 0) + (p.value_without_tax || 0);
          }
          const sorted = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b));
          return {
            query_type,
            suggested_chart: 'area',
            data: sorted.map(([name, value]) => ({ name, value: Math.round(value / 100) })),
            currency: fullProposals[0]?.currency ?? 'USD',
          };
        }

        case 'proposal_count_by_month': {
          const monthly: Record<string, number> = {};
          for (const p of searchItems) {
            const ts = p.updated_at || p.created_at || 0;
            if (!ts) continue;
            const d = new Date(ts * 1000);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthly[key] = (monthly[key] || 0) + 1;
          }
          const sorted = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b));
          return {
            query_type,
            suggested_chart: 'bar',
            data: sorted.map(([name, value]) => ({ name, value })),
          };
        }

        case 'value_by_company': {
          const companies: Record<string, number> = {};
          for (const p of fullProposals) {
            const name = p.recipient_company_name || p.company_name || p.title || 'Unknown';
            companies[name] = (companies[name] || 0) + (p.value_without_tax || 0);
          }
          return {
            query_type,
            suggested_chart: 'bar',
            data: Object.entries(companies)
              .map(([name, value]) => ({ name, value: Math.round(value / 100) }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 10),
          };
        }

        case 'win_rate_trend': {
          const monthly: Record<string, { sent: number; won: number }> = {};
          for (const p of searchItems) {
            const ts = p.updated_at || p.created_at || 0;
            if (!ts) continue;
            const d = new Date(ts * 1000);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!monthly[key]) monthly[key] = { sent: 0, won: 0 };
            if (p.status !== 'draft' && p.status !== 'template') monthly[key].sent++;
            if (p.status === 'accepted') monthly[key].won++;
          }
          const sorted = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b));
          return {
            query_type,
            suggested_chart: 'composed',
            data: sorted.map(([name, v]) => ({
              name,
              win_rate: v.sent > 0 ? Math.round((v.won / v.sent) * 100) : 0,
              sent: v.sent,
              won: v.won,
            })),
            series: [
              { key: 'sent', label: 'Proposals Sent', color: '#4461D7', type: 'bar' },
              { key: 'won', label: 'Won', color: '#36B37E', type: 'bar' },
              { key: 'win_rate', label: 'Win Rate %', color: '#FF5630', type: 'line' },
            ],
          };
        }

        case 'avg_value_by_status': {
          const groups: Record<string, { total: number; count: number }> = {};
          for (const p of fullProposals) {
            const s = String(p.status ?? 'unknown');
            if (!groups[s]) groups[s] = { total: 0, count: 0 };
            groups[s].total += p.value_without_tax || 0;
            groups[s].count++;
          }
          return {
            query_type,
            suggested_chart: 'bar',
            data: Object.entries(groups).map(([name, v]) => ({
              name,
              value: v.count > 0 ? Math.round(v.total / v.count / 100) : 0,
            })),
          };
        }

        case 'top_companies': {
          const companies: Record<string, number> = {};
          for (const p of searchItems) {
            const name = p.title || 'Unknown';
            companies[name] = (companies[name] || 0) + 1;
          }
          return {
            query_type,
            suggested_chart: 'pie',
            data: Object.entries(companies)
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 8),
          };
        }

        case 'pipeline_funnel': {
          const stages = ['draft', 'active', 'accepted', 'rejected', 'expired', 'withdrawn'];
          const counts: Record<string, number> = {};
          for (const p of searchItems) {
            const s = String(p.status ?? 'unknown');
            counts[s] = (counts[s] || 0) + 1;
          }
          return {
            query_type,
            suggested_chart: 'funnel',
            data: stages.map((name) => ({ name, value: counts[name] || 0 })),
          };
        }

        case 'custom': {
          const field = group_by ?? 'status';
          const groups: Record<string, { count: number; sum: number }> = {};
          // Custom queries use full proposals if value metrics are needed
          const items = (metric === 'sum_value' || metric === 'avg_value') ? fullProposals : searchItems;
          for (const p of items) {
            const rec = p as unknown as Record<string, unknown>;
            const key = String(rec[field] ?? 'unknown');
            if (!groups[key]) groups[key] = { count: 0, sum: 0 };
            groups[key].count++;
            groups[key].sum += Number(rec.value_without_tax) || 0;
          }
          const m = metric ?? 'count';
          return {
            query_type,
            suggested_chart: 'bar',
            data: Object.entries(groups).map(([name, v]) => ({
              name,
              value:
                m === 'count'
                  ? v.count
                  : m === 'sum_value'
                    ? Math.round(v.sum / 100)
                    : v.count > 0
                      ? Math.round(v.sum / v.count / 100)
                      : 0,
            })),
          };
        }
      }
    },
  });
}

export function createSuggestPricingTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'Analyze pricing and suggest adjustments. Compares a proposal against historical data to recommend pricing changes. Use when the user wants to negotiate price or optimize a deal.',
    inputSchema: z.object({
      proposal_uuid: z.string().describe('UUID of the proposal to analyze'),
      requested_discount_percent: z
        .number()
        .optional()
        .describe('The discount percentage the client is requesting'),
    }),
    execute: async ({ proposal_uuid, requested_discount_percent }) => {
      const result = await sdk.proposals.get(proposal_uuid);
      const p = result.data;

      const totalWithTax = p.value_with_tax;
      const totalWithoutTax = p.value_without_tax;
      const blockCount = p.blocks?.length ?? 0;

      const blocks = (p.blocks ?? []).map(b => ({
        title: b.title,
        quantity: b.quantity ?? 1,
        unit_price_with_tax: (b.unit_value_with_discount_with_tax ?? 0) / 100,
        unit_price_without_tax: (b.unit_value_with_discount_without_tax ?? 0) / 100,
        optional: b.optional ?? false,
        optional_picked: b.optional_picked ?? false,
      }));

      let analysis = {
        current_value_with_tax: totalWithTax,
        current_value_without_tax: totalWithoutTax,
        current_value_with_tax_display: Math.round(totalWithTax / 100),
        current_value_without_tax_display: Math.round(totalWithoutTax / 100),
        block_count: blockCount,
        blocks,
        currency: p.currency,
        status: p.status,
        recipient_name: p.recipient_name,
        recipient_company: p.recipient_company_name,
        requested_discount_percent,
        discount_amount: 0,
        new_total: totalWithoutTax,
        new_total_display: Math.round(totalWithoutTax / 100),
        recommendation: '',
      };

      if (requested_discount_percent) {
        analysis.discount_amount = Math.round(
          totalWithoutTax * (requested_discount_percent / 100),
        );
        analysis.new_total = totalWithoutTax - analysis.discount_amount;

        if (requested_discount_percent <= 5) {
          analysis.recommendation =
            'This is a small discount that should be safe to approve. Consider offering it as a goodwill gesture.';
        } else if (requested_discount_percent <= 15) {
          analysis.recommendation =
            'Moderate discount. Consider offering a counter at around half the requested discount, or bundle additional value instead.';
        } else {
          analysis.recommendation =
            'This discount is aggressive. Recommend counter-offering at max 10% with added value (e.g., complimentary items, extended dates).';
        }
      }

      return analysis;
    },
  });
}
