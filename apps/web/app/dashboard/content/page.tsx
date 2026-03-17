'use client';

import { useState } from 'react';
import {
  PageHeader,
  Button,
  DataTable,
  Badge,
  Input,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  Textarea,
  formatDate,
  type Column,
} from '@proposales/ui';
import { useContent, apiPost, apiPut } from '@/lib/hooks';

export default function ContentPage() {
  const { data, error, isLoading, mutate } = useContent();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({ title: '', description: '' });

  const content: Record<string, unknown>[] = data?.data
    ? Array.isArray(data.data) ? data.data : [data.data]
    : [];

  const filtered = content.filter((item) => {
    if (!search) return true;
    const title = typeof item.title === 'object' ? JSON.stringify(item.title) : String(item.title ?? '');
    return title.toLowerCase().includes(search.toLowerCase());
  });

  async function handleCreate() {
    setCreating(true);
    try {
      await apiPost('/api/proposales/content', {
        title: { en: form.title },
        description: { en: form.description },
      });
      setShowCreate(false);
      setForm({ title: '', description: '' });
      mutate();
    } catch {
      // TODO: toast
    } finally {
      setCreating(false);
    }
  }

  function getTitle(item: Record<string, unknown>): string {
    if (typeof item.title === 'object' && item.title !== null) {
      const t = item.title as Record<string, string>;
      return t.en || t.sv || Object.values(t)[0] || 'Untitled';
    }
    return String(item.title ?? 'Untitled');
  }

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'title',
      header: 'Content Item',
      render: (item) => (
        <div>
          <p className="font-medium text-gray-900">{getTitle(item)}</p>
          <p className="text-xs text-gray-400">ID: {item.product_id as number}</p>
        </div>
      ),
    },
    {
      key: 'variation_id',
      header: 'Variation',
      render: (item) => <Badge variant="outline">{String(item.variation_id ?? '—')}</Badge>,
    },
    {
      key: 'images',
      header: 'Images',
      render: (item) => {
        const imgs = item.images as unknown[] | undefined;
        return <span className="text-sm text-gray-600">{imgs?.length ?? 0}</span>;
      },
    },
    {
      key: 'is_archived',
      header: 'State',
      render: (item) => (
        <Badge variant={item.is_archived ? 'warning' : 'success'}>
          {item.is_archived ? 'Archived' : 'Active'}
        </Badge>
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
        title="Content Library"
        description="Manage reusable content blocks for proposals"
        actions={
          <Button onClick={() => setShowCreate(true)}>+ New Content</Button>
        }
      />

      <div className="flex items-center gap-4">
        <div className="w-full max-w-xs">
          <Input
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Badge variant="default">{filtered.length} items</Badge>
      </div>

      {error && (
        <div className="rounded-card border border-error-200 bg-error-50 p-4">
          <p className="text-sm text-error-700">{error.message}</p>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={(item) => String(item.product_id ?? Math.random())}
        loading={isLoading}
        emptyMessage="No content items found."
      />

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}>
        <ModalHeader>
          <ModalTitle>Create Content Item</ModalTitle>
        </ModalHeader>
        <div className="space-y-4">
          <Input
            label="Title"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Enter content title"
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Enter description"
            rows={4}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowCreate(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} loading={creating} disabled={!form.title}>
            Create
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
