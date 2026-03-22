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

  const sdk = getSDK();
  const storedByUuid = new Map(
    userProposals.map((up) => [up.proposalUuid, up]),
  );

  // Source of truth: Proposales API filtered by this user email
  const [contactItems, recipientItems] = await Promise.all([
    sdk.proposals.searchAll({ contact_email: email.toLowerCase() }).catch(() => []),
    sdk.proposals.searchAll({ recipient_email: email.toLowerCase() }).catch(() => []),
  ]);

  const mergedUuids = new Set<string>();
  for (const item of [...contactItems, ...recipientItems]) {
    if (item?.uuid) mergedUuids.add(item.uuid);
  }
  for (const up of userProposals) {
    if (up.proposalUuid) mergedUuids.add(up.proposalUuid);
  }

  const allUuids = Array.from(mergedUuids);
  const batchSize = 10;
  const resultRows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < allUuids.length; i += batchSize) {
    const batch = allUuids.slice(i, i + batchSize);
    const rows = await Promise.all(batch.map(async (uuid) => {
      const stored = storedByUuid.get(uuid);
      let live: Record<string, unknown> | null = null;

      try {
        const full = await sdk.proposals.get(uuid);
        live = full.data as unknown as Record<string, unknown>;
      } catch {
        // keep fallback-only row
      }

      const liveStatus = (live?.status as string | undefined) ?? null;
      const tracking = (live?.tracking as Record<string, unknown> | undefined) ?? undefined;
      const signatures = (live?.signatures as unknown[] | undefined) ?? undefined;
      const hasSignature = Array.isArray(signatures) && signatures.length > 0;
      const viewedCount = (tracking?.number_of_views as number) ?? 0;
      const firstViewedAt = tracking?.first_viewed_at;
      const isViewed = viewedCount > 0 || !!firstViewedAt;

      let displayStatus = (stored?.status ?? 'draft') as string;
      if (hasSignature || liveStatus === 'accepted' || liveStatus === 'signed') {
        displayStatus = 'signed';
      } else if (liveStatus === 'rejected' || liveStatus === 'lost') {
        displayStatus = 'rejected';
      } else if (liveStatus === 'expired') {
        displayStatus = 'expired';
      } else if (liveStatus === 'active' && isViewed) {
        displayStatus = 'viewed';
      } else if (liveStatus === 'active') {
        displayStatus = 'sent';
      } else if (liveStatus === 'draft' || liveStatus === 'template') {
        displayStatus = 'draft';
      }

      const liveData = (live?.data as Record<string, unknown> | undefined) ?? undefined;
      const guestsRaw = liveData?.guests;
      const guests = typeof guestsRaw === 'number' ? guestsRaw : Number(guestsRaw);

      return {
        _id: stored ? String(stored._id) : uuid,
        proposalUuid: uuid,
        proposalTitle: (live?.title_md as string | undefined) || stored?.proposalTitle || 'Untitled proposal',
        proposalUrl: (live?.pdf_url as string | undefined) || stored?.proposalUrl || null,
        status: displayStatus,
        totalAmountCents: (live?.value_with_tax as number | undefined) ?? stored?.totalAmountCents ?? 0,
        currency: (live?.currency as string | undefined) ?? stored?.currency ?? 'EUR',
        venueType: (liveData?.venue_type as string | undefined) ?? stored?.venueType,
        eventDate: (liveData?.event_date as string | undefined) ?? stored?.eventDate,
        guests: Number.isFinite(guests) ? guests : (stored?.guests ?? undefined),
        viewedCount,
        createdAt: (live?.created_at as number | undefined)
          ? new Date((live?.created_at as number) * 1000).toISOString()
          : (stored?.createdAt ?? new Date().toISOString()),
        updatedAt: (live?.updated_at as number | undefined)
          ? new Date((live?.updated_at as number) * 1000).toISOString()
          : (stored?.updatedAt ?? new Date().toISOString()),
      };
    }));

    resultRows.push(...rows);
  }

  resultRows.sort((a, b) => {
    const aTime = new Date(String(a.updatedAt)).getTime();
    const bTime = new Date(String(b.updatedAt)).getTime();
    return bTime - aTime;
  });

  return NextResponse.json({ data: resultRows });
}
