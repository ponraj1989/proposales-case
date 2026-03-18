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
  formatCurrency,
  formatRelativeTime,
  type Column,
} from '@proposales/ui';
import { useProposals, apiPost } from '@/lib/hooks';

const STATUS_FILTERS = ['all', 'draft', 'active', 'accepted', 'rejected', 'expired', 'template'] as const;

export default function ProposalsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [creating, setCreating] = useState(false);

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
        currency: 'USD',
      });
      const uuid = result?.data?.uuid;
      if (uuid) {
        router.push(`/dashboard/proposals/${uuid}`);
      }
      mutate();
    } catch {
      // TODO: toast
    } finally {
      setCreating(false);
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
      render: (item) => <StatusBadge status={item.status as string} />,
    },
    {
      key: 'value_with_tax',
      header: 'Value',
      render: (item) => (
        <span className="font-medium tabular-nums">
          {formatCurrency((item.value_with_tax as number) || 0, (item.currency as string) || 'USD')}
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
          <Button onClick={handleCreateDraft} loading={creating}>
            + New Proposal
          </Button>
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
                  ? 'bg-brand-500 text-white'
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

      {/* Table */}
      <DataTable
        columns={columns}
        data={proposals}
        keyExtractor={(item) => item.uuid as string}
        onRowClick={(item) => router.push(`/dashboard/proposals/${item.uuid}`)}
        loading={isLoading}
        emptyMessage="No proposals found. Create your first one!"
      />
    </div>
  );
}
