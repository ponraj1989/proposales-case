import type { ProposalesSDK } from '@proposales/api-client';
import {
  createSearchProposalsTool,
  createGetProposalTool,
  createCreateProposalTool,
  createPatchProposalTool,
  createGenerateProposalDraftTool,
  createReviseProposalPricingTool,
  createListContentTool,
  createListCompaniesTool,
  createListTemplatesTool,
  createAnalyzePortfolioTool,
  createRenderChartTool,
  createQueryProposalDataTool,
  createSuggestPricingTool,
} from './tools';
export { systemPrompt, salesAdvisorPrompt, proposalWriterPrompt } from './prompts';
export * from './tools';

export function createAllTools(sdk: ProposalesSDK) {
  return {
    searchProposals: createSearchProposalsTool(sdk),
    getProposal: createGetProposalTool(sdk),
    createProposal: createCreateProposalTool(sdk),
    patchProposal: createPatchProposalTool(sdk),
    generateProposalDraft: createGenerateProposalDraftTool(),
    reviseProposalPricing: createReviseProposalPricingTool(),
    listContent: createListContentTool(sdk),
    listCompanies: createListCompaniesTool(sdk),
    listTemplates: createListTemplatesTool(sdk),
    analyzePortfolio: createAnalyzePortfolioTool(sdk),
    renderChart: createRenderChartTool(),
    queryProposalData: createQueryProposalDataTool(sdk),
    suggestPricing: createSuggestPricingTool(sdk),
  };
}
