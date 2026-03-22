import { getSDK } from '@/lib/sdk';
import { DashboardClient } from './client';

export default async function DashboardPage() {
  let proposals: unknown[] = [];
  let content: unknown[] = [];
  let companies: unknown[] = [];
  let error: string | null = null;

  try {
    const sdk = getSDK();
    
    // Proposales API limits results to 25 per status, so we need to query each status separately
    const statuses = ['draft', 'active', 'accepted', 'rejected', 'expired'];
    const proposalsByStatus = await Promise.all(
      statuses.map(status =>
        sdk.proposals.searchAll({ status }).catch(() => [])
      )
    );
    
    // Merge and deduplicate proposals by UUID
    const proposalMap = new Map<string, unknown>();
    for (const statusProposals of proposalsByStatus) {
      const items = Array.isArray(statusProposals) ? statusProposals : [];
      for (const proposal of items) {
        const uuid =
          proposal && typeof proposal === 'object' && 'uuid' in proposal && typeof proposal.uuid === 'string'
            ? proposal.uuid
            : undefined;
        if (uuid && !proposalMap.has(uuid)) {
          proposalMap.set(uuid, proposal);
        }
      }
    }
    proposals = Array.from(proposalMap.values());

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
