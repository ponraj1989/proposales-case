import type { ProposalesSDK } from '@proposales/api-client';
import {
  createSearchProposalsTool,
  createGetProposalTool,
  createCreateProposalTool,
  createPatchProposalTool,
  createReviseProposalTool,
  createGenerateProposalDraftTool,
  createReviseProposalPricingTool,
  createListContentTool,
  createListCompaniesTool,
  createListTemplatesTool,
  createAnalyzePortfolioTool,
  createRenderChartTool,
  createQueryProposalDataTool,
  createSuggestPricingTool,
  createExtractEventDetailsTool,
  createAcceptProposalTool,
  createRequestUserInputTool,
  createCheckAvailabilityTool,
  createCalculateEventPriceTool,
  createGetMonthAvailabilityTool,
  createSuggestFloorPlanTool,
  createGenerateImageTool,
  type SendEsignEmailFn,
  type PmsService,
} from './tools';
export { systemPrompt, customerPrompt, salesAdvisorPrompt, proposalWriterPrompt } from './prompts';
export * from './tools';

/** Full tool set for sales users */
export function createAllTools(
  sdk: ProposalesSDK,
  userInfo?: { email?: string; name?: string },
  sendEsignEmail?: SendEsignEmailFn,
  pmsService?: PmsService,
) {
  return {
    searchProposals: createSearchProposalsTool(sdk),
    getProposal: createGetProposalTool(sdk),
    createProposal: createCreateProposalTool(sdk),
    patchProposal: createPatchProposalTool(sdk),
    reviseProposal: createReviseProposalTool(sdk),
    generateProposalDraft: createGenerateProposalDraftTool(sdk, userInfo),
    reviseProposalPricing: createReviseProposalPricingTool(sdk, userInfo),
    listContent: createListContentTool(sdk),
    listCompanies: createListCompaniesTool(sdk),
    listTemplates: createListTemplatesTool(sdk),
    analyzePortfolio: createAnalyzePortfolioTool(sdk),
    renderChart: createRenderChartTool(),
    queryProposalData: createQueryProposalDataTool(sdk),
    suggestPricing: createSuggestPricingTool(sdk),
    extractEventDetails: createExtractEventDetailsTool(),
    acceptProposal: createAcceptProposalTool(sdk, userInfo),
    checkAvailability: createCheckAvailabilityTool(pmsService),
    calculateEventPrice: createCalculateEventPriceTool(pmsService),
    getMonthAvailability: createGetMonthAvailabilityTool(pmsService),
    suggestFloorPlan: createSuggestFloorPlanTool(pmsService),
    requestUserInput: createRequestUserInputTool(),
    generateImage: createGenerateImageTool(),
  };
}

/** Minimal tool set for customer users (event booking only) */
export function createCustomerTools(
  sdk: ProposalesSDK,
  userInfo?: { email?: string; name?: string },
  _sendEsignEmail?: SendEsignEmailFn,
  pmsService?: PmsService,
) {
  return {
    listContent: createListContentTool(sdk),
    extractEventDetails: createExtractEventDetailsTool(),
    generateProposalDraft: createGenerateProposalDraftTool(sdk, userInfo),
    reviseProposalPricing: createReviseProposalPricingTool(sdk, userInfo),
    reviseProposal: createReviseProposalTool(sdk),
    acceptProposal: createAcceptProposalTool(sdk, userInfo),
    checkAvailability: createCheckAvailabilityTool(pmsService),
    calculateEventPrice: createCalculateEventPriceTool(pmsService),
    getMonthAvailability: createGetMonthAvailabilityTool(pmsService),
    suggestFloorPlan: createSuggestFloorPlanTool(pmsService),
    requestUserInput: createRequestUserInputTool(),
    generateImage: createGenerateImageTool(),
  };
}
