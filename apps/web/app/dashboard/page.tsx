import { getSDK } from '@/lib/sdk';
import { DashboardClient } from './client';

export default async function DashboardPage() {
  let proposals: unknown[] = [];
  let content: unknown[] = [];
  let companies: unknown[] = [];
  let error: string | null = null;

  try {
    const sdk = getSDK();

    const visibleStatuses = new Set(['draft', 'active', 'accepted', 'rejected', 'lost', 'expired']);
    const allItems = await sdk.proposals.searchAll().catch(() => []);
    proposals = (Array.isArray(allItems) ? allItems : []).filter(
      (proposal) => typeof proposal?.status === 'string' && visibleStatuses.has(proposal.status),
    );

    const [contentRes, companyRes] = await Promise.all([
      sdk.content.list(),
      sdk.companies.list(),
    ]);

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
