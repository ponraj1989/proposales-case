'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PageHeader,
  Button,
  DataTable,
  StatusBadge,
  Badge,
  Input,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  formatCurrency,
  formatRelativeTime,
  type Column,
} from '@proposales/ui';
import { cn } from '@proposales/ui';
import { useProposals, useCompanies, useContent, apiPost, apiPatch, useUser, useEmailLogs, type EmailLogEntry } from '@/lib/hooks';

const STATUS_FILTERS = ['all', 'draft', 'active', 'accepted', 'rejected', 'lost', 'expired', 'template'] as const;

const KANBAN_COLUMNS = [
  { key: 'draft', label: 'Draft', color: 'bg-gray-400', lightBg: 'bg-gray-50', border: 'border-gray-200' },
  { key: 'active', label: 'Sent', color: 'bg-blue-500', lightBg: 'bg-blue-50', border: 'border-blue-200' },
  { key: 'viewed', label: 'Viewed', color: 'bg-amber-500', lightBg: 'bg-amber-50', border: 'border-amber-200' },
  { key: 'accepted', label: 'E-signed', color: 'bg-green-500', lightBg: 'bg-green-50', border: 'border-green-200' },
  { key: 'rejected', label: 'Rejected', color: 'bg-red-400', lightBg: 'bg-red-50', border: 'border-red-200' },
] as const;

const AI_QUICK_CREATE_EXAMPLE = 'conference for 120 guests on april 15 at grand banquet hall with lunch and av equipment';
const AI_QUICK_CREATE_WEDDING_EXAMPLE = 'wedding reception for 200 guests on june 10 at banquet grand with full board meals and stage decoration';

type ContentItemLite = { variation_id: number; title: Record<string, string>; description: Record<string, string> };

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getContentTitle(item: ContentItemLite): string {
  return (item.title?.en || Object.values(item.title || {})[0] || '').trim();
}

function buildFallbackShortTitle(eventTypeRaw?: string, roomRaw?: string): string {
  const eventType = normalizeText(eventTypeRaw || 'event');
  const room = normalizeText(roomRaw || '');

  if (eventType.includes('wedding')) return 'Banquet Wedding Reception Package';
  if (eventType.includes('conference')) {
    if (room.includes('grand banquet') || room.includes('banquet')) return 'Grand Banquet Conference Package';
    if (room.includes('boardroom')) return 'Boardroom Conference Session Package';
    return 'Corporate Conference Event Package';
  }
  if (eventType.includes('meeting')) return 'Executive Meeting Room Package';
  if (eventType.includes('accommodation') || eventType.includes('stay')) return 'Cozy Weekend Stay Package';
  if (eventType.includes('dinner') || eventType.includes('gala')) return 'Elegant Gala Dinner Package';
  if (eventType.includes('party') || eventType.includes('reception')) return 'Private Reception Event Package';
  return 'Premium Event Experience Package';
}

function sanitizeShortTitle(candidate: string, eventTypeRaw?: string, roomRaw?: string): string {
  const cleaned = candidate
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(Boolean);
  if (words.length >= 4 && words.length <= 5) {
    return words.join(' ');
  }
  if (words.length > 5) {
    return words.slice(0, 5).join(' ');
  }
  return buildFallbackShortTitle(eventTypeRaw, roomRaw);
}

function includesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((keyword) => haystack.includes(keyword));
}

function autoSelectBlocksFromPrompt(params: {
  prompt: string;
  extracted: Record<string, unknown>;
  contentItems: ContentItemLite[];
}): Array<{ content_id: number; quantity: number }> {
  const { prompt, extracted, contentItems } = params;
  const combinedText = normalizeText(`${prompt} ${(extracted.room as string) || ''} ${(extracted.event_type as string) || ''}`);
  const guestsRaw = extracted.guests;
  const guests = typeof guestsRaw === 'number' ? guestsRaw : Number(guestsRaw);
  const safeGuests = Number.isFinite(guests) && guests > 0 ? Math.floor(guests) : 1;
  const selected = new Map<number, number>();

  const addByPredicate = (
    predicate: (normalizedTitle: string) => boolean,
    quantity: number,
  ) => {
    const match = contentItems.find((item) => predicate(normalizeText(getContentTitle(item))));
    if (match) {
      selected.set(match.variation_id, quantity);
    }
    return !!match;
  };

  // Venue / space selection
  if (includesAny(combinedText, ['grand banquet', 'banquet hall', 'banquet'])) {
    addByPredicate((title) => title.includes('banquet grand') || title.includes('grand banquet'), 1)
      || addByPredicate((title) => title.includes('banquet'), 1);
  } else if (includesAny(combinedText, ['boardroom'])) {
    addByPredicate((title) => title.includes('boardroom medium'), 1)
      || addByPredicate((title) => title.includes('boardroom'), 1);
  } else if (includesAny(combinedText, ['conference'])) {
    addByPredicate((title) => title.includes('conference'), 1)
      || addByPredicate((title) => title.includes('boardroom'), 1);
  } else if (includesAny(combinedText, ['wedding', 'reception'])) {
    addByPredicate((title) => title.includes('banquet grand'), 1)
      || addByPredicate((title) => title.includes('banquet'), 1);
  }

  // Catering by guests
  if (includesAny(combinedText, ['lunch'])) {
    addByPredicate((title) => title.includes('lunch'), safeGuests);
  }
  if (includesAny(combinedText, ['dinner'])) {
    addByPredicate((title) => title.includes('dinner'), safeGuests);
  }
  if (includesAny(combinedText, ['breakfast'])) {
    addByPredicate((title) => title.includes('breakfast'), safeGuests);
  }
  if (includesAny(combinedText, ['all meals', 'full board'])) {
    addByPredicate((title) => title.includes('all meals') || title.includes('full board'), safeGuests);
  }

  // AV equipment
  const wantsAv = includesAny(combinedText, ['av', 'audio', 'visual', 'projector', 'microphone', 'speaker', 'sound']);
  if (wantsAv) {
    addByPredicate((title) => title.includes('projector'), 1);
    addByPredicate((title) => title.includes('microphones and speakers') || title.includes('microphone'), 1);
  }

  return Array.from(selected.entries()).map(([content_id, quantity]) => ({ content_id, quantity }));
}

export default function ProposalsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiCreating, setAiCreating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    eventType: '',
    guests: '',
    contactName: '',
    contactEmail: '',
    contactCompany: '',
    contactPhone: '',
    title: '',
    description: '',
    invoicingEnabled: false,
    taxMode: 'standard' as 'standard' | 'simplified' | 'tax-free' | 'none',
    taxIncluded: true,
    taxLabel: 'VAT',
  });
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('kanban');
  const [columnOverrides, setColumnOverrides] = useState<Record<string, string>>({});

  const { data: userData } = useUser();
  const isSales = userData?.role === 'sales';

  // Fetch companies for company_id, content for pricing tips
  const { data: companiesData } = useCompanies();
  const { data: contentData } = useContent();
  const companies: { id: number; name: string; currency: string; tax_mode: string }[] = companiesData?.data ?? [];
  const defaultCompany = companies[0];
  const contentItems: { variation_id: number; title: Record<string, string>; description: Record<string, string> }[] = contentData?.data ?? [];

  // Fetch email logs for sales users only
  const { data: emailLogsData } = useEmailLogs(isSales ? undefined : '__skip__');
  const emailStatusMap = isSales
    ? (emailLogsData?.data ?? []).reduce<Record<string, EmailLogEntry>>((acc, log) => {
        const existing = acc[log.proposalUuid];
        // Keep the "best" (most advanced) status per proposal
        const order = ['failed', 'bounced', 'sent', 'delivered', 'opened', 'clicked'];
        if (!existing || order.indexOf(log.status) > order.indexOf(existing.status)) {
          acc[log.proposalUuid] = log;
        }
        return acc;
      }, {})
    : {};

  // Always fetch all proposals — client-side filtering handles status + text.
  // The Proposales API's filter[status] is unreliable (returns mixed statuses).
  const { data, error, isLoading, mutate } = useProposals();

  const allProposals: Record<string, unknown>[] = data?.data
    ? Array.isArray(data.data)
      ? data.data
      : [data.data]
    : [];

  // Client-side status + text filtering
  const proposals = allProposals.filter((p) => {
    // Status filter (table mode only — kanban shows all and distributes into columns)
    if (viewMode === 'table' && statusFilter !== 'all') {
      const pStatus = (p.status as string) || '';
      if (pStatus !== statusFilter) return false;
    }
    // Text search
    if (searchText) {
      const needle = searchText.toLowerCase();
      const title = ((p.title_md || p.title || '') as string).toLowerCase();
      const contact = ((p.contact_name || p.recipient_name || '') as string).toLowerCase();
      const email = ((p.contact_email || p.recipient_email || '') as string).toLowerCase();
      const uuid = ((p.uuid || '') as string).toLowerCase();
      if (!title.includes(needle) && !contact.includes(needle) && !email.includes(needle) && !uuid.includes(needle)) return false;
    }
    return true;
  });

  // Derive the live status from a proposal's tracking data + API status
  function deriveLiveStatus(proposal: Record<string, unknown>): 'draft' | 'active' | 'viewed' | 'accepted' | 'rejected' | 'expired' {
    const apiStatus = (proposal.status as string) || 'draft';
    const tracking = proposal.tracking as Record<string, unknown> | undefined;
    const signatures = proposal.signatures as unknown[] | undefined;

    // E-signed / accepted
    if (apiStatus === 'accepted' || (signatures && signatures.length > 0)) return 'accepted';
    // Rejected
    if (apiStatus === 'rejected' || apiStatus === 'lost') return 'rejected';
    // Expired
    if (apiStatus === 'expired') return 'expired';

    // Active proposals: check if viewed
    if (apiStatus === 'active') {
      const viewCount = (proposal.viewed_count as number) || (tracking?.number_of_views as number) || 0;
      const firstViewed = tracking?.first_viewed_at;
      if (viewCount > 0 || firstViewed) return 'viewed';
      return 'active';
    }

    return 'draft';
  }

  function getCardColumn(proposal: Record<string, unknown>): string {
    const uuid = (proposal.uuid as string) || '';
    if (uuid && columnOverrides[uuid]) return columnOverrides[uuid];
    return deriveLiveStatus(proposal);
  }

  async function handleMoveProposal(uuid: string, toColumn: string) {
    const mappedStatus = toColumn === 'viewed' ? 'active' : toColumn;

    setColumnOverrides((prev) => ({ ...prev, [uuid]: toColumn }));

    try {
      await apiPatch(`/api/proposales/proposals/${uuid}`, { data: { status: mappedStatus } });
      await mutate();
    } catch {
      setColumnOverrides((prev) => {
        const next = { ...prev };
        delete next[uuid];
        return next;
      });
    }
  }

  async function handleCreateDraft() {
    if (!defaultCompany) return;
    setCreating(true);
    try {
      // Build recipient from form
      const nameParts = (createForm.contactName || '').split(' ');
      const firstName = nameParts[0] || undefined;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

      const body: Record<string, unknown> = {
        company_id: defaultCompany.id,
        language: 'en',
        title_md: createForm.title || undefined,
        description_md: createForm.description || undefined,
        contact_email: createForm.contactEmail || undefined,
        recipient: {
          first_name: firstName,
          last_name: lastName,
          email: createForm.contactEmail || undefined,
          phone: createForm.contactPhone || undefined,
          company_name: createForm.contactCompany || undefined,
        },
        data: {
          event_type: createForm.eventType || undefined,
          guests: createForm.guests ? parseInt(createForm.guests, 10) : undefined,
          status: 'draft',
          negotiation_round: 0,
          discount_applied: 0,
        },
        invoicing_enabled: createForm.invoicingEnabled,
        tax_options: {
          mode: createForm.taxMode,
          tax_included: createForm.taxIncluded,
          tax_label_key: createForm.taxLabel || undefined,
        },
      };

      const result = await apiPost('/api/proposales/proposals', body);
      const uuid = result?.proposal?.uuid;
      if (uuid) {
        router.push(`/dashboard/proposals/${uuid}`);
      }
      mutate();
      setShowCreateModal(false);
      setCreateForm({
        eventType: '', guests: '', contactName: '', contactEmail: '',
        contactCompany: '', contactPhone: '', title: '', description: '',
        invoicingEnabled: false, taxMode: 'standard', taxIncluded: true, taxLabel: 'VAT',
      });
    } catch {
      // TODO: toast
    } finally {
      setCreating(false);
    }
  }

  async function handleAIGenerateTitle() {
    setGeneratingTitle(true);
    try {
      const res = await fetch('/api/ai/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.eventType || 'Hotel Event',
          eventType: createForm.eventType,
          guests: createForm.guests,
          context: [
            createForm.contactName ? `Client: ${createForm.contactName}` : '',
            createForm.contactEmail ? `Email: ${createForm.contactEmail}` : '',
            'Generate ONLY a short, professional proposal title (one line, max 80 chars). No description.',
          ].filter(Boolean).join('. '),
        }),
      });
      if (res.ok) {
        const { description } = await res.json();
        // Extract just the first line as title
        const title = description.split('\n')[0].replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
        setCreateForm((prev) => ({ ...prev, title }));
      }
    } catch { /* ignore */ }
    setGeneratingTitle(false);
  }

  async function handleAIGenerateDescription() {
    setGeneratingDesc(true);
    try {
      const res = await fetch('/api/ai/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title || createForm.eventType,
          eventType: createForm.eventType,
          guests: createForm.guests,
          context: [
            createForm.contactName ? `Client: ${createForm.contactName}` : '',
            createForm.contactEmail ? `Email: ${createForm.contactEmail}` : '',
          ].filter(Boolean).join('. '),
        }),
      });
      if (res.ok) {
        const { description } = await res.json();
        setCreateForm((prev) => ({ ...prev, description }));
      }
    } catch { /* ignore */ }
    setGeneratingDesc(false);
  }

  async function handleAiCreate() {
    if (!aiPrompt.trim()) return;
    const companyId = defaultCompany?.id ?? 5230;
    setAiCreating(true);
    setAiError(null);
    try {
      // Step 1: Extract structured data from free text
      let extracted: Record<string, unknown> = {};
      try {
        const extractRes = await fetch('/api/ai/generate-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'extract', context: aiPrompt.trim() }),
        });
        if (extractRes.ok) {
          extracted = (await extractRes.json()).extracted ?? {};
        }
      } catch {
        // Continue with empty extraction
      }

      const eventType = (extracted.event_type as string) || 'Event';
      const guests = extracted.guests ? String(extracted.guests) : '';

      // Step 2: Generate title (best-effort)
      let title = buildFallbackShortTitle(eventType, extracted.room as string | undefined);
      try {
        const titleRes = await fetch('/api/ai/generate-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: eventType,
            eventType,
            guests,
            context: `${aiPrompt.trim()}. Generate ONLY a short premium proposal title with STRICT 4 to 5 words. Return exactly one line title only, no description.`,
          }),
        });
        if (titleRes.ok) {
          const { description } = await titleRes.json();
          title = sanitizeShortTitle(description.split('\n')[0] || '', eventType, extracted.room as string | undefined);
        }
      } catch {
        // Use default title
      }

      title = sanitizeShortTitle(title, eventType, extracted.room as string | undefined);

      // Step 3: Generate description (best-effort)
      let description = '';
      try {
        const descRes = await fetch('/api/ai/generate-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            eventType,
            guests,
            context: aiPrompt.trim(),
          }),
        });
        if (descRes.ok) {
          const data = await descRes.json();
          description = data.description || '';
        }
      } catch {
        // Use empty description
      }

      // Step 4: Build recipient from extracted data
      const nameParts = ((extracted.contact_name as string) || '').split(' ');
      const firstName = nameParts[0] || undefined;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

      // Validate email format before including it
      const rawEmail = (extracted.contact_email as string) || '';
      const contactEmail = rawEmail.includes('@') ? rawEmail : undefined;

      const recipient: Record<string, unknown> = {};
      if (firstName) recipient.first_name = firstName;
      if (lastName) recipient.last_name = lastName;
      if (contactEmail) recipient.email = contactEmail;
      if (extracted.contact_company) recipient.company_name = extracted.contact_company;

      const body: Record<string, unknown> = {
        company_id: companyId,
        language: 'en',
        title_md: title,
        description_md: description,
      };
      if (contactEmail) body.contact_email = contactEmail;
      if (Object.keys(recipient).length > 0) body.recipient = recipient;

      const dataPayload: Record<string, unknown> = {
        status: 'draft',
        negotiation_round: 0,
        discount_applied: 0,
      };
      if (extracted.event_type) dataPayload.event_type = extracted.event_type;
      if (extracted.event_date) dataPayload.event_date = extracted.event_date;
      if (extracted.guests) dataPayload.guests = extracted.guests;
      if (extracted.room) dataPayload.room = extracted.room;
      if (extracted.time_slot) dataPayload.time_slot = extracted.time_slot;
      if (extracted.notes) dataPayload.notes = extracted.notes;
      body.data = dataPayload;

      // Step 4b: Auto-pick content blocks from prompt (space + guests + services)
      const autoBlocks = autoSelectBlocksFromPrompt({
        prompt: aiPrompt.trim(),
        extracted,
        contentItems,
      });
      if (autoBlocks.length > 0) {
        body.blocks = autoBlocks;
        dataPayload.selected_content_items = autoBlocks;
      }

      // Step 5: Create proposal via API
      const result = await apiPost('/api/proposales/proposals', body);

      // Handle multiple possible response shapes from Proposales API
      const newUuid =
        result?.proposal?.uuid ??
        result?.data?.uuid ??
        result?.uuid;

      if (newUuid) {
        setShowAiModal(false);
        setAiPrompt('');
        await mutate();
        router.push(`/dashboard/proposals/${newUuid}`);
      } else {
        // Proposal created but UUID not found in response — refresh list
        await mutate();
        setShowAiModal(false);
        setAiPrompt('');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create proposal';
      setAiError(msg);
      console.error('[AI Create] Error:', msg);
    } finally {
      setAiCreating(false);
    }
  }

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'title',
      header: 'Proposal',
      render: (item) => (
        <div>
          <p className="font-medium text-gray-900 truncate max-w-[240px]">
            {(item.title_md || item.title || 'Untitled') as string}
          </p>
          <p className="text-xs text-gray-400 font-mono">{(item.uuid as string)?.slice(0, 12)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <div className="flex flex-col gap-1">
          <ProposalStatusStepper proposal={item} compact />
        </div>
      ),
    },
    {
      key: 'value_with_tax',
      header: 'Value',
      render: (item) => (
        <span className="font-medium tabular-nums">
          {formatCurrency((item.value_with_tax as number) || 0, (item.currency as string) || 'EUR')}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (item) => (
        <div className="text-sm">
          <p className="text-gray-700">{(item.contact_name || item.recipient_name || '—') as string}</p>
          {item.contact_email ? (
            <p className="text-xs text-gray-400">{item.contact_email as string}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Ver.',
      render: (item) => <Badge variant="outline">v{(item.version ?? 1) as number}</Badge>,
    },
    ...(isSales
      ? [{
          key: 'email_status',
          header: 'Email',
          render: (item: Record<string, unknown>) => {
            const log = emailStatusMap[(item.uuid as string) ?? ''];
            if (!log) return <span className="text-xs text-gray-300">—</span>;
            return <EmailStatusBadge status={log.status} />;
          },
        }]
      : []),
    {
      key: 'updated_at',
      header: 'Updated',
      render: (item) => (
        <span className="text-sm text-gray-500">
          {item.updated_at ? formatRelativeTime(item.updated_at as number) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Proposals"
        description={`Manage and track all your proposals`}
        actions={
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                onClick={() => setViewMode('kanban')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  viewMode === 'kanban' ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
                </svg>
                Kanban
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  viewMode === 'table' ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M21.375 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M12 17.25v-5.25" />
                </svg>
                Table
              </button>
            </div>
            <Button variant="secondary" onClick={() => { setAiError(null); setShowAiModal(true); }}>
              ✨ AI Create
            </Button>
            <Button onClick={() => router.push('/dashboard/proposals/new')}>
              Form
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search proposals..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-card border border-error-200 bg-error-50 p-4">
          <p className="text-sm text-error-700">{error.message}</p>
        </div>
      )}

      {/* Table or Kanban */}
      {viewMode === 'table' ? (
        <DataTable
          columns={columns}
          data={proposals}
          keyExtractor={(item) => item.uuid as string}
          onRowClick={(item) => router.push(`/dashboard/proposals/${item.uuid}`)}
          loading={isLoading}
          emptyMessage="No proposals found. Create your first one!"
        />
      ) : (
        <KanbanBoard
          proposals={proposals}
          onCardClick={(uuid) => router.push(`/dashboard/proposals/${uuid}`)}
          onMoveCard={handleMoveProposal}
          getColumn={getCardColumn}
          isLoading={isLoading}
          emailStatusMap={emailStatusMap}
        />
      )}

      {/* AI-Assisted Create Proposal Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <ModalHeader>
          <ModalTitle>Create New Proposal</ModalTitle>
        </ModalHeader>
        <div className="px-6 py-4 space-y-4">
          {/* Event Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Event Type</label>
              <select
                value={createForm.eventType}
                onChange={(e) => setCreateForm({ ...createForm, eventType: e.target.value })}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
              >
                <option value="">Select type...</option>
                <option value="conference">Conference</option>
                <option value="wedding">Wedding</option>
                <option value="meeting">Meeting</option>
                <option value="dinner">Dinner / Gala</option>
                <option value="seminar">Seminar</option>
                <option value="party">Party / Reception</option>
                <option value="accommodation">Accommodation</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Guest Count</label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 50"
                value={createForm.guests}
                onChange={(e) => setCreateForm({ ...createForm, guests: e.target.value })}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
          </div>
          {/* Recipient / Contact */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Recipient Name"
              placeholder="John Doe"
              value={createForm.contactName}
              onChange={(e) => setCreateForm({ ...createForm, contactName: e.target.value })}
            />
            <Input
              label="Recipient Email"
              type="email"
              placeholder="john@company.com"
              value={createForm.contactEmail}
              onChange={(e) => setCreateForm({ ...createForm, contactEmail: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Company"
              placeholder="Acme Inc."
              value={createForm.contactCompany}
              onChange={(e) => setCreateForm({ ...createForm, contactCompany: e.target.value })}
            />
            <Input
              label="Phone"
              placeholder="+46 70 123 4567"
              value={createForm.contactPhone}
              onChange={(e) => setCreateForm({ ...createForm, contactPhone: e.target.value })}
            />
          </div>
          {/* Invoicing & Tax */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createForm.invoicingEnabled}
                onChange={(e) => setCreateForm({ ...createForm, invoicingEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
              />
              <span className="text-xs font-medium text-gray-700">Enable invoicing</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[0.65rem] font-medium text-gray-500 mb-1">Tax Mode</label>
                <select
                  value={createForm.taxMode}
                  onChange={(e) => setCreateForm({ ...createForm, taxMode: e.target.value as typeof createForm.taxMode })}
                  className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-gray-400 focus:outline-none"
                >
                  <option value="standard">Standard</option>
                  <option value="simplified">Simplified</option>
                  <option value="tax-free">Tax-free</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div>
                <label className="block text-[0.65rem] font-medium text-gray-500 mb-1">Tax Included</label>
                <select
                  value={createForm.taxIncluded ? 'yes' : 'no'}
                  onChange={(e) => setCreateForm({ ...createForm, taxIncluded: e.target.value === 'yes' })}
                  className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-gray-400 focus:outline-none"
                >
                  <option value="yes">Included</option>
                  <option value="no">Excluded</option>
                </select>
              </div>
              <div>
                <label className="block text-[0.65rem] font-medium text-gray-500 mb-1">Tax Label</label>
                <input
                  value={createForm.taxLabel}
                  onChange={(e) => setCreateForm({ ...createForm, taxLabel: e.target.value })}
                  placeholder="VAT"
                  className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-gray-400 focus:outline-none"
                />
              </div>
            </div>
          </div>
          {/* AI Title */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600">Proposal Title</label>
              <button
                onClick={handleAIGenerateTitle}
                disabled={generatingTitle}
                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
              >
                {generatingTitle ? (
                  <span className="flex items-center gap-1"><span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" /> Generating...</span>
                ) : (
                  <>✨ AI Suggest</>
                )}
              </button>
            </div>
            <input
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              placeholder={generatingTitle ? 'Generating title...' : 'Enter title or click AI Suggest'}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
          {/* AI Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600">Description</label>
              <button
                onClick={handleAIGenerateDescription}
                disabled={generatingDesc}
                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
              >
                {generatingDesc ? (
                  <span className="flex items-center gap-1"><span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" /> Generating...</span>
                ) : (
                  <>✨ AI Generate</>
                )}
              </button>
            </div>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              rows={4}
              placeholder={generatingDesc ? 'Generating description...' : 'Enter description or click AI Generate'}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
            />
          </div>

          {/* Season / Price Tip */}
          {createForm.eventType && createForm.guests && (
            <PricingTip eventType={createForm.eventType} guests={parseInt(createForm.guests) || 0} contentItems={contentItems} />
          )}
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateDraft} loading={creating}>
            Create Proposal
          </Button>
        </ModalFooter>
      </Modal>

      {/* AI One-Click Create Modal */}
      <Modal open={showAiModal} onClose={() => setShowAiModal(false)}>
        <ModalHeader>
          <ModalTitle>✨ AI Quick Create</ModalTitle>
        </ModalHeader>
        <div className="px-6 py-4 space-y-4">
          <p className="text-xs text-gray-500">Describe your event in plain text and AI will create a complete proposal draft instantly.</p>

          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
            <p className="text-[11px] font-semibold text-indigo-700 mb-1">Example (copy and use)</p>
            <p className="text-xs text-indigo-900 break-words">{AI_QUICK_CREATE_EXAMPLE}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
                onClick={() => setAiPrompt(AI_QUICK_CREATE_EXAMPLE)}
              >
                Use Example
              </button>
              <button
                type="button"
                className="rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
                onClick={() => {
                  void navigator.clipboard?.writeText(AI_QUICK_CREATE_EXAMPLE);
                }}
              >
                Copy
              </button>
            </div>

            <p className="mt-3 text-xs text-indigo-900 break-words">{AI_QUICK_CREATE_WEDDING_EXAMPLE}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
                onClick={() => setAiPrompt(AI_QUICK_CREATE_WEDDING_EXAMPLE)}
              >
                Use Wedding Example
              </button>
              <button
                type="button"
                className="rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
                onClick={() => {
                  void navigator.clipboard?.writeText(AI_QUICK_CREATE_WEDDING_EXAMPLE);
                }}
              >
                Copy Wedding
              </button>
            </div>
          </div>

          <div>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={4}
              autoFocus
              placeholder={AI_QUICK_CREATE_EXAMPLE}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && aiPrompt.trim()) {
                  handleAiCreate();
                }
              }}
            />
            <p className="text-[10px] text-gray-400 mt-1.5">Include event type, date, guest count, venue, contact info, and any special requirements. Press Ctrl+Enter to create.</p>
          </div>

          {aiError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-700">{aiError}</p>
            </div>
          )}

          {aiCreating && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 flex items-center gap-2">
              <svg className="h-4 w-4 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-xs font-medium text-indigo-700">AI is analyzing your request and generating the proposal...</p>
            </div>
          )}
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowAiModal(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAiCreate}
            loading={aiCreating}
            disabled={!aiPrompt.trim()}
          >
            {aiCreating ? 'Creating...' : '✨ Create with AI'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// ─── Live Status Stepper ───

const STATUS_STEPS = [
  { key: 'draft', label: 'Draft', icon: '📝' },
  { key: 'sent', label: 'Sent', icon: '📧' },
  { key: 'viewed', label: 'Viewed', icon: '👁' },
  { key: 'signed', label: 'E-signed', icon: '✅' },
] as const;

function getStepIndex(proposal: Record<string, unknown>): number {
  const status = (proposal.status as string) || 'draft';
  const tracking = proposal.tracking as Record<string, unknown> | undefined;
  const signatures = proposal.signatures as unknown[] | undefined;

  if (status === 'accepted' || (signatures && signatures.length > 0)) return 3; // e-signed
  if (tracking?.first_viewed_at || (proposal.viewed_count as number) > 0 || (tracking?.number_of_views as number) > 0) return 2; // viewed
  if (status === 'active' || tracking?.sent_at) return 1; // sent
  return 0; // draft
}

function ProposalStatusStepper({ proposal, compact }: { proposal: Record<string, unknown>; compact?: boolean }) {
  const currentStep = getStepIndex(proposal);
  const status = (proposal.status as string) || 'draft';

  // For rejected/lost/expired, show a special indicator
  if (status === 'rejected' || status === 'lost') {
    return (
      <div className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        <span className="text-[10px] font-medium text-red-600">{status === 'lost' ? 'Lost' : 'Rejected'}</span>
      </div>
    );
  }
  if (status === 'expired') {
    return (
      <div className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        <span className="text-[10px] font-medium text-amber-600">Expired</span>
      </div>
    );
  }

  if (compact) {
    // Compact: just dots with connecting lines
    return (
      <div className="flex items-center gap-0.5">
        {STATUS_STEPS.map((step, i) => {
          const isDone = i <= currentStep;
          const isCurrent = i === currentStep;
          return (
            <div key={step.key} className="flex items-center">
              <div
                className={cn(
                  'h-2 w-2 rounded-full transition-all',
                  isDone
                    ? isCurrent
                      ? 'bg-green-500 ring-2 ring-green-200'
                      : 'bg-green-500'
                    : 'bg-gray-200',
                )}
                title={`${step.label}${isDone ? ' ✓' : ''}`}
              />
              {i < STATUS_STEPS.length - 1 && (
                <div className={cn('h-0.5 w-3 mx-0.5', i < currentStep ? 'bg-green-400' : 'bg-gray-200')} />
              )}
            </div>
          );
        })}
        <span className="ml-1 text-[10px] font-medium text-gray-600">
          {STATUS_STEPS[currentStep].label}
        </span>
      </div>
    );
  }

  // Full: with labels
  return (
    <div className="flex items-center gap-1">
      {STATUS_STEPS.map((step, i) => {
        const isDone = i <= currentStep;
        const isCurrent = i === currentStep;
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] transition-all',
                  isDone
                    ? isCurrent
                      ? 'bg-green-500 text-white ring-2 ring-green-200'
                      : 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-400',
                )}
              >
                {isDone ? '✓' : i + 1}
              </div>
              <span className={cn('text-[9px] mt-0.5', isDone ? 'text-green-700 font-medium' : 'text-gray-400')}>
                {step.label}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className={cn('h-0.5 w-4 mx-0.5 mt-[-10px]', i < currentStep ? 'bg-green-400' : 'bg-gray-200')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Kanban Board ───

function KanbanBoard({
  proposals,
  onCardClick,
  onMoveCard,
  getColumn,
  isLoading,
  emailStatusMap,
}: {
  proposals: Record<string, unknown>[];
  onCardClick: (uuid: string) => void;
  onMoveCard: (uuid: string, toColumn: string) => void;
  getColumn: (proposal: Record<string, unknown>) => string;
  isLoading: boolean;
  emailStatusMap: Record<string, EmailLogEntry>;
}) {
  const [draggedUuid, setDraggedUuid] = useState<string | null>(null);
  const [activeDropColumn, setActiveDropColumn] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((col) => (
          <div key={col.key} className="flex-shrink-0 w-64">
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className={cn('h-2.5 w-2.5 rounded-full', col.color)} />
                <span className="text-sm font-semibold text-gray-700">{col.label}</span>
              </div>
              {[1, 2].map((i) => (
                <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((col) => {
        const colProposals = proposals.filter((p) => getColumn(p) === col.key);

        return (
          <div key={col.key} className="flex-shrink-0 w-72">
            <div
              className={cn(
                'rounded-xl border border-gray-200 bg-gray-50/30 p-3 transition-colors',
                activeDropColumn === col.key && 'ring-2 ring-gray-300 bg-gray-100/60',
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setActiveDropColumn(col.key);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setActiveDropColumn(col.key);
              }}
              onDragLeave={() => {
                if (activeDropColumn === col.key) setActiveDropColumn(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const uuid = e.dataTransfer.getData('text/plain');
                setActiveDropColumn(null);
                setDraggedUuid(null);
                if (uuid) {
                  onMoveCard(uuid, col.key);
                }
              }}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <div className={cn('h-2.5 w-2.5 rounded-full', col.color)} />
                  <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                </div>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-200 px-1.5 text-[0.65rem] font-semibold text-gray-600">
                  {colProposals.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[100px]">
                {colProposals.length === 0 && (
                  <div className="flex items-center justify-center py-8 text-xs text-gray-400">
                    No proposals
                  </div>
                )}
                {colProposals.map((p, i) => (
                  <div
                    key={p.uuid as string}
                    onClick={() => onCardClick(p.uuid as string)}
                    draggable
                    onDragStart={(e) => {
                      const uuid = p.uuid as string;
                      e.dataTransfer.setData('text/plain', uuid);
                      setDraggedUuid(uuid);
                    }}
                    onDragEnd={() => {
                      setDraggedUuid(null);
                      setActiveDropColumn(null);
                    }}
                    className={cn(
                      'kanban-card cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5',
                      col.border,
                      draggedUuid === (p.uuid as string) && 'opacity-60',
                    )}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {(p.title_md || p.title || 'Untitled') as string}
                    </p>
                    {/* Live status stepper */}
                    <div className="mt-1.5">
                      <ProposalStatusStepper proposal={p} compact />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {(p.contact_name || p.recipient_name || '—') as string}
                      </span>
                      {p.value_with_tax != null && (
                        <span className="text-xs font-semibold text-gray-700">
                          {formatCurrency((p.value_with_tax as number) || 0, (p.currency as string) || 'EUR')}
                        </span>
                      )}
                    </div>
                    {p.updated_at ? (
                      <p className="mt-1.5 text-[0.6rem] text-gray-400">
                        {formatRelativeTime(p.updated_at as number)}
                      </p>
                    ) : null}
                    {emailStatusMap[(p.uuid as string) ?? ''] && (
                      <div className="mt-1.5">
                        <EmailStatusBadge status={emailStatusMap[(p.uuid as string) ?? ''].status} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Email Status Badge ───

function EmailStatusBadge({ status }: { status: EmailLogEntry['status'] }) {
  const config: Record<EmailLogEntry['status'], { label: string; className: string; icon: string }> = {
    sent:      { label: 'Sent',      className: 'bg-blue-50 text-blue-600 border-blue-100',   icon: '📧' },
    delivered: { label: 'Delivered', className: 'bg-indigo-50 text-indigo-600 border-indigo-100', icon: '✉️' },
    opened:    { label: 'Opened',    className: 'bg-amber-50 text-amber-600 border-amber-100',  icon: '👁' },
    clicked:   { label: 'Clicked',   className: 'bg-green-50 text-green-600 border-green-100',  icon: '✅' },
    bounced:   { label: 'Bounced',   className: 'bg-red-50 text-red-500 border-red-100',        icon: '⚠️' },
    failed:    { label: 'Failed',    className: 'bg-gray-50 text-gray-400 border-gray-100',     icon: '✗' },
  };
  const c = config[status] ?? config.sent;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[0.6rem] font-medium ${c.className}`}>
      {c.icon} {c.label}
    </span>
  );
}

// ─── Smart Pricing Suggestion ───

// ─── Peak / Holiday Season Calendar ───

const HOLIDAY_SEASONS: { label: string; months: number[]; surcharge: number; icon: string }[] = [
  { label: 'Peak Summer', months: [5, 6, 7], surcharge: 0.15, icon: '☀️' },          // Jun–Aug +15%
  { label: 'Christmas / New Year', months: [11, 0], surcharge: 0.20, icon: '🎄' },    // Dec–Jan +20%
  { label: 'Easter week', months: [2, 3], surcharge: 0.10, icon: '🐣' },              // Mar–Apr +10% (approx)
  { label: 'Midsummer (Scandinavia)', months: [5], surcharge: 0.12, icon: '🌻' },     // Jun +12%
];
const OFF_PEAK_MONTHS = [1, 8, 9, 10]; // Feb, Sep, Oct, Nov — potential discounts

function getSeasonInfo(month: number) {
  const matched = HOLIDAY_SEASONS.filter((s) => s.months.includes(month));
  const isOffPeak = OFF_PEAK_MONTHS.includes(month);
  const totalSurcharge = matched.reduce((sum, s) => sum + s.surcharge, 0);
  return { matched, isOffPeak, totalSurcharge };
}

interface ContentItem {
  variation_id: number;
  title: Record<string, string>;
  description: Record<string, string>;
}

function PricingTip({ eventType, guests, contentItems = [] }: { eventType: string; guests: number; contentItems?: ContentItem[] }) {
  const now = new Date();
  const month = now.getMonth();
  const { matched: seasons, isOffPeak, totalSurcharge } = getSeasonInfo(month);
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  // Content-library based pricing if available
  const contentCount = contentItems.length;

  // Rough base prices per event type in EUR cents
  const basePrices: Record<string, number> = {
    conference: 28000, wedding: 56000, meeting: 15900,
    dinner: 18000, seminar: 28000, party: 32000, accommodation: 5300,
  };

  const basePerEvent = basePrices[eventType] || 20000;
  let estimatedBase = basePerEvent;

  const tips: string[] = [];

  // Season tips with detailed holiday info
  if (seasons.length > 0) {
    const names = seasons.map((s) => `${s.icon} ${s.label} (+${Math.round(s.surcharge * 100)}%)`).join(', ');
    estimatedBase = Math.round(estimatedBase * (1 + totalSurcharge));
    tips.push(`📅 Active season surcharges: ${names}. Total: +${Math.round(totalSurcharge * 100)}%.`);
    tips.push('🗓️ Off-peak months (Feb, Sep–Nov) offer 10–15% savings — consider date flexibility for negotiation.');
  } else if (isOffPeak) {
    tips.push('💰 Off-peak season: strong negotiation leverage. Discounts of 10–15% are common.');
  } else {
    tips.push('📅 Shoulder season — standard pricing with moderate negotiation room (5–8%).');
  }

  if (isWeekend) {
    estimatedBase = Math.round(estimatedBase * 1.2);
    tips.push('📆 Weekend premium: +20%. Weekday events save significantly.');
  } else {
    tips.push('✅ Weekday pricing — no weekend surcharge.');
  }

  // Venue recommendation by headcount
  if (guests > 200) {
    tips.push(`👥 Large group (${guests} pax): Grand Ballroom recommended. Utilization surcharge may apply if >80% capacity.`);
  } else if (guests <= 20) {
    tips.push(`👥 Small group (${guests} pax): Executive Boardroom is ideal. Small-party discount of 10% may apply.`);
  } else if (guests <= 80) {
    tips.push(`👥 Medium group (${guests} pax): The Grand Restaurant or Conference Hall A would work well.`);
  }

  // Content library insight
  if (contentCount > 0) {
    tips.push(`📦 ${contentCount} items in content library — blocks will pull real pricing from Proposales when the draft is created.`);
  }

  // Negotiation guidance
  tips.push('🤝 Negotiation: Round 1 → 5–8% off | Round 2 → 10–15% off | Round 3 (final) → up to 20% off. Max 3 rounds.');

  // Per-person add-on estimates
  const mealsPerPerson = 31.80;
  const accomPerPerson = 53.00;
  const allInclusive = estimatedBase / 100 + (mealsPerPerson + accomPerPerson) * guests;
  const bundle = allInclusive * 0.88;

  tips.push(`💡 All-inclusive estimate: ~€${Math.round(allInclusive).toLocaleString()} | Bundle deal (12% off): ~€${Math.round(bundle).toLocaleString()}`);

  // Invoice tip
  tips.push('🧾 Enable invoicing to collect company name, org number, and address on the active proposal for billing.');

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-sm">💡</span>
        <span className="text-xs font-semibold text-gray-700">Smart Pricing & Season Tips</span>
      </div>
      {tips.map((tip, i) => (
        <p key={i} className="text-xs text-gray-600 leading-relaxed pl-5">{tip}</p>
      ))}
    </div>
  );
}
