import { createProposalesSDK, type ProposalesSDK } from '@proposales/api-client';

let sdk: ProposalesSDK | null = null;

export function getSDK(companyId?: number): ProposalesSDK {
  const baseUrl = process.env.PROPOSALES_API_URL;
  const token = process.env.PROPOSALES_API_TOKEN;

  if (!baseUrl || !token) {
    throw new Error('PROPOSALES_API_URL and PROPOSALES_API_TOKEN must be configured');
  }

  // For company-scoped requests, always create new instance
  if (companyId) {
    return createProposalesSDK({ baseUrl, token, companyId });
  }

  // Singleton for default (non-company-scoped) requests
  if (!sdk) {
    sdk = createProposalesSDK({ baseUrl, token });
  }

  return sdk;
}
