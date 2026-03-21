'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PageHeader,
  Button,
  DataTable,
  Badge,
  Input,
  formatDate,
  type Column,
} from '@proposales/ui';
import { useCompanies } from '@/lib/hooks';

export default function CompaniesPage() {
  const router = useRouter();
  const { data, error, isLoading } = useCompanies();
  const [search, setSearch] = useState('');

  const companies: Record<string, unknown>[] = data?.data
    ? Array.isArray(data.data) ? data.data : [data.data]
    : [];

  const filtered = companies.filter((c) => {
    if (!search) return true;
    return String(c.name ?? '').toLowerCase().includes(search.toLowerCase());
  });

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'name',
      header: 'Company',
      render: (item) => (
        <div>
          <p className="font-medium text-gray-900">{(item.name || 'Unnamed') as string}</p>
          <p className="text-xs text-gray-400">ID: {item.id as number}</p>
        </div>
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      render: (item) => <Badge variant="outline">{(item.currency || '—') as string}</Badge>,
    },
    {
      key: 'tax_mode',
      header: 'Tax Mode',
      render: (item) => (
        <span className="text-sm text-gray-600 capitalize">{(item.tax_mode || '—') as string}</span>
      ),
    },
    {
      key: 'registration_number',
      header: 'Reg. Number',
      render: (item) => (
        <span className="text-sm text-gray-600 font-mono">{(item.registration_number || '—') as string}</span>
      ),
    },
    {
      key: 'website_url',
      header: 'Website',
      render: (item) =>
        item.website_url ? (
          <a
            href={item.website_url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-700 hover:underline truncate block max-w-[180px]"
          >
            {(item.website_url as string).replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (item) => (
        <span className="text-sm text-gray-500">
          {item.created_at ? formatDate(item.created_at as number) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Companies"
        description="All companies connected to your Proposales account"
      />

      <div className="flex items-center gap-4">
        <div className="w-full max-w-xs">
          <Input
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Badge variant="default">{filtered.length} companies</Badge>
      </div>

      {error && (
        <div className="rounded-card border border-error-200 bg-error-50 p-4">
          <p className="text-sm text-error-700">{error.message}</p>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        onRowClick={(item) => router.push(`/dashboard/companies/${item.id}`)}
        loading={isLoading}
        emptyMessage="No companies found."
      />
    </div>
  );
}
