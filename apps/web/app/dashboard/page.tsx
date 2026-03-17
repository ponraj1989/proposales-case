import { getSDK } from '@/lib/sdk';
import { DashboardClient } from './client';

export default async function DashboardPage() {
  let proposals: unknown[] = [];
  let content: unknown[] = [];
  let companies: unknown[] = [];
  let error: string | null = null;

  try {
    const sdk = getSDK();
    const [proposalRes, contentRes, companyRes] = await Promise.all([
      sdk.proposals.search({}, 50),
      sdk.content.list(),
      sdk.companies.list(),
    ]);

    proposals = Array.isArray(proposalRes.data) ? proposalRes.data : [proposalRes.data];
    content = Array.isArray(contentRes.data) ? contentRes.data : [];
    companies = Array.isArray(companyRes.data) ? companyRes.data : [];
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load data';
  }

  return (
    <DashboardClient
      proposals={proposals}
      content={content}
      companies={companies}
      error={error}
    />
  );
}
