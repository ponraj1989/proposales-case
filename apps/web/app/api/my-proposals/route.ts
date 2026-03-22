import { NextResponse } from 'next/server';
import { getSession, getUserEmail } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import { UserProposal } from '@/lib/models';
import { getSDK } from '@/lib/sdk';

/**
 * GET /api/my-proposals — Returns proposals created by the current user via chat.
 * Fetches stored UserProposal records from MongoDB and enriches with live
 * Proposales API data (pdf_url, current status) when available.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { message: 'Authentication required' } }, { status: 401 });
  }

  const email = await getUserEmail();
  if (!email) {
    return NextResponse.json({ data: [] });
  }

  await connectDB();
  const userProposals = await UserProposal.find({ userEmail: email.toLowerCase() })
    .sort({ createdAt: -1 })
    .lean();

  // Enrich with live Proposales API data
  const sdk = getSDK();
  const enriched = await Promise.all(
    userProposals.map(async (up) => {
      let liveStatus: string | null = null;
      let livePdfUrl: string | null = null;
      let liveValueWithTax: number | null = null;
      let liveViewedCount = 0;
      let liveTitleMd: string | null = null;

      try {
        const result = await sdk.proposals.get(up.proposalUuid);
        const d = result.data;
        if (d) {
          liveStatus = d.status ?? null;
          livePdfUrl = d.pdf_url ?? null;
          liveValueWithTax = d.value_with_tax ?? null;
          liveViewedCount = (d as unknown as Record<string, unknown>).viewed_count as number ?? 0;
          liveTitleMd = d.title_md ?? null;
        }
      } catch {
        // API fetch failed — return stored data only
      }

      // Merge: prefer webhook-tracked status for signed/accepted, else use API status
      let displayStatus = up.status;
      if (liveStatus === 'accepted' || liveStatus === 'signed') displayStatus = 'signed';
      else if (liveStatus === 'active' && up.status === 'draft') displayStatus = 'active';
      else if (liveStatus === 'expired') displayStatus = 'expired';

      return {
        _id: String(up._id),
        proposalUuid: up.proposalUuid,
        proposalTitle: liveTitleMd || up.proposalTitle,
        proposalUrl: livePdfUrl || up.proposalUrl || null,
        status: displayStatus,
        totalAmountCents: liveValueWithTax ?? up.totalAmountCents,
        currency: up.currency,
        venueType: up.venueType,
        eventDate: up.eventDate,
        guests: up.guests,
        viewedCount: liveViewedCount,
        createdAt: up.createdAt,
        updatedAt: up.updatedAt,
      };
    }),
  );

  return NextResponse.json({ data: enriched });
}
