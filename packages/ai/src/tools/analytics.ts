import { z } from 'zod';
import { tool } from 'ai';
import type { ProposalesSDK } from '@proposales/api-client';

export function createAnalyzePortfolioTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'Analyze the proposal portfolio to provide sales insights. Fetches proposals, content, and company data to generate analytics. Use when the user asks about performance, trends, win rates, or wants improvement suggestions.',
    parameters: z.object({
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
      const [proposals, content, companies] = await Promise.all([
        sdk.proposals.search({}, 25),
        sdk.content.list(),
        sdk.companies.list(),
      ]);

      const proposalList = Array.isArray(proposals.data) ? proposals.data : [proposals.data];

      const stats = {
        total: proposalList.length,
        byStatus: {} as Record<string, number>,
        totalValue: 0,
        companies: companies.data.length,
        contentItems: content.data.length,
      };

      for (const p of proposalList) {
        const status = p.status ?? 'unknown';
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      }

      return {
        analysis_type,
        stats,
        proposals: proposalList,
        content_count: content.data.length,
        company_count: companies.data.length,
      };
    },
  });
}

export function createRenderChartTool() {
  return tool({
    description:
      'Generate chart configuration data for visualization. Returns a JSON config that can be rendered as a Recharts component in the chat UI. Use when the user asks to visualize data, show charts, or see trends.',
    parameters: z.object({
      chart_type: z
        .enum(['bar', 'pie', 'line', 'area'])
        .describe('Type of chart to render'),
      title: z.string().describe('Chart title'),
      data: z
        .array(
          z.object({
            name: z.string(),
            value: z.number(),
            fill: z.string().optional(),
          }),
        )
        .describe('Chart data points'),
      x_key: z.string().optional().describe('Key for X axis (default: "name")'),
      y_key: z.string().optional().describe('Key for Y axis (default: "value")'),
    }),
    execute: async ({ chart_type, title, data, x_key, y_key }) => {
      return {
        type: 'chart',
        chart_type,
        title,
        data,
        x_key: x_key ?? 'name',
        y_key: y_key ?? 'value',
      };
    },
  });
}

export function createSuggestPricingTool(sdk: ProposalesSDK) {
  return tool({
    description:
      'Analyze pricing and suggest adjustments. Compares a proposal against historical data to recommend pricing changes. Use when the user wants to negotiate price or optimize a deal.',
    parameters: z.object({
      proposal_uuid: z.string().describe('UUID of the proposal to analyze'),
      requested_discount_percent: z
        .number()
        .optional()
        .describe('The discount percentage the client is requesting'),
    }),
    execute: async ({ proposal_uuid, requested_discount_percent }) => {
      const proposal = await sdk.proposals.get(proposal_uuid);
      const p = proposal.data;

      const totalWithTax = p.value_with_tax;
      const totalWithoutTax = p.value_without_tax;
      const blockCount = p.blocks.length;

      let analysis = {
        current_value_with_tax: totalWithTax,
        current_value_without_tax: totalWithoutTax,
        block_count: blockCount,
        currency: p.currency,
        requested_discount_percent,
        discount_amount: 0,
        new_total: totalWithoutTax,
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
