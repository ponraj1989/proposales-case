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
import { useProposals, apiPost, apiPut, useUser, useEmailLogs, type EmailLogEntry } from '@/lib/hooks';

const STATUS_FILTERS = ['all', 'draft', 'active', 'accepted', 'rejected', 'expired', 'template'] as const;

const KANBAN_COLUMNS = [
  { key: 'draft', label: 'Draft', color: 'bg-gray-400', lightBg: 'bg-gray-50', border: 'border-gray-200' },
  { key: 'active', label: 'Sent', color: 'bg-blue-500', lightBg: 'bg-blue-50', border: 'border-blue-200' },
  { key: 'viewed', label: 'Viewed', color: 'bg-amber-500', lightBg: 'bg-amber-50', border: 'border-amber-200' },
  { key: 'accepted', label: 'Accepted', color: 'bg-green-500', lightBg: 'bg-green-50', border: 'border-green-200' },
  { key: 'rejected', label: 'Rejected', color: 'bg-red-400', lightBg: 'bg-red-50', border: 'border-red-200' },
] as const;

export default function ProposalsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    eventType: '',
    guests: '',
    contactName: '',
    contactEmail: '',
    title: '',
    description: '',
  });
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('kanban');

  const { data: userData } = useUser();
  const isSales = userData?.role === 'sales';

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

  const params: Record<string, string> = {};
  if (searchText) params.text = searchText;
  if (statusFilter !== 'all') params.status = statusFilter;

  const { data, error, isLoading, mutate } = useProposals(params);

  const proposals: Record<string, unknown>[] = data?.data
    ? Array.isArray(data.data)
      ? data.data
      : [data.data]
    : [];

  async function handleCreateDraft() {
    setCreating(true);
    try {
      const result = await apiPost('/api/proposales/proposals', {
        status: 'draft',
        language: 'en',
        currency: 'EUR',
        title_md: createForm.title || undefined,
        description_md: createForm.description || undefined,
        contact_name: createForm.contactName || undefined,
        contact_email: createForm.contactEmail || undefined,
      });
      const uuid = result?.data?.uuid;
      if (uuid) {
        // If we have a title or description, patch the proposal with them
        if (createForm.title || createForm.description) {
          await apiPut(`/api/proposales/proposals/${uuid}`, {
            title_md: createForm.title || undefined,
            description_md: createForm.description || undefined,
            contact_name: createForm.contactName || undefined,
            contact_email: createForm.contactEmail || undefined,
          }).catch(() => {});
        }
        router.push(`/dashboard/proposals/${uuid}`);
      }
      mutate();
      setShowCreateModal(false);
      setCreateForm({ eventType: '', guests: '', contactName: '', contactEmail: '', title: '', description: '' });
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
      render: (item) => <StatusBadge status={item.status as string} />,
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
            <Button onClick={() => setShowCreateModal(true)}>
              + New Proposal
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
        <KanbanBoard proposals={proposals} onCardClick={(uuid) => router.push(`/dashboard/proposals/${uuid}`)} isLoading={isLoading} emailStatusMap={emailStatusMap} />
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
          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contact Name"
              placeholder="John Doe"
              value={createForm.contactName}
              onChange={(e) => setCreateForm({ ...createForm, contactName: e.target.value })}
            />
            <Input
              label="Contact Email"
              type="email"
              placeholder="john@company.com"
              value={createForm.contactEmail}
              onChange={(e) => setCreateForm({ ...createForm, contactEmail: e.target.value })}
            />
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
            <PricingTip eventType={createForm.eventType} guests={parseInt(createForm.guests) || 0} />
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
    </div>
  );
}

// ─── Kanban Board ───

function KanbanBoard({
  proposals,
  onCardClick,
  isLoading,
  emailStatusMap,
}: {
  proposals: Record<string, unknown>[];
  onCardClick: (uuid: string) => void;
  isLoading: boolean;
  emailStatusMap: Record<string, EmailLogEntry>;
}) {
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
        const colProposals = proposals.filter((p) => {
          const status = p.status as string;
          if (col.key === 'viewed') return status === 'active' && (p.viewed_count as number) > 0;
          if (col.key === 'active') return status === 'active' && !(p.viewed_count as number);
          return status === col.key;
        });

        return (
          <div key={col.key} className="flex-shrink-0 w-72">
            <div className="rounded-xl border border-gray-200 bg-gray-50/30 p-3">
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
                    className={cn(
                      'kanban-card cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5',
                      col.border,
                    )}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {(p.title_md || p.title || 'Untitled') as string}
                    </p>
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

function PricingTip({ eventType, guests }: { eventType: string; guests: number }) {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const isPeak = month >= 5 && month <= 7; // Jun-Aug
  const isOffPeak = month >= 10 || month <= 1; // Nov-Feb
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  // Rough base prices per event type in EUR (for suggestion only)
  const basePrices: Record<string, number> = {
    conference: 28000,
    wedding: 56000,
    meeting: 15900,
    dinner: 18000,
    seminar: 28000,
    party: 32000,
    accommodation: 5300,
  };

  const basePerEvent = basePrices[eventType] || 20000;
  let estimatedBase = basePerEvent;

  const tips: string[] = [];

  if (isPeak) {
    estimatedBase = Math.round(estimatedBase * 1.15);
    tips.push('📅 Peak season (Jun–Aug): prices are +15% higher. Consider Sep–Nov for savings.');
  } else if (isOffPeak) {
    tips.push('💰 Off-peak season: potential for discounted rates. Great time to book!');
  }

  if (isWeekend) {
    estimatedBase = Math.round(estimatedBase * 1.2);
    tips.push('📆 Weekend premium: +20%. Weekday events save significantly.');
  } else {
    tips.push('✅ Weekday pricing — no weekend surcharge.');
  }

  if (guests > 200) {
    tips.push(`👥 Large group (${guests} pax): consider Grand Ballroom. Utilization surcharge may apply if >80% capacity.`);
  } else if (guests <= 20) {
    tips.push(`👥 Small group (${guests} pax): Executive Boardroom is ideal. Small-party discount of 10% may apply.`);
  } else if (guests <= 80) {
    tips.push(`👥 Medium group (${guests} pax): The Grand Restaurant or Conference Hall A would work well.`);
  }

  // Per-person add-on estimates
  const mealsPerPerson = 31.80;
  const accomPerPerson = 53.00;
  const allInclusive = estimatedBase / 100 + (mealsPerPerson + accomPerPerson) * guests;
  const bundle = allInclusive * 0.88; // 12% bundle discount

  tips.push(`💡 All-inclusive estimate: ~€${Math.round(allInclusive).toLocaleString()} | Bundle deal (12% off): ~€${Math.round(bundle).toLocaleString()}`);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-sm">💡</span>
        <span className="text-xs font-semibold text-gray-700">Smart Pricing Tips</span>
      </div>
      {tips.map((tip, i) => (
        <p key={i} className="text-xs text-gray-600 leading-relaxed pl-5">{tip}</p>
      ))}
    </div>
  );
}
