'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { useContent, useCompanies, apiPost, apiPut, apiDelete } from '@/lib/hooks';

type ContentItem = {
  product_id?: number;
  variation_id?: number;
  title?: string | Record<string, string>;
  description?: string | Record<string, string>;
  images?: unknown[];
  is_archived?: boolean;
  created_at?: number;
};

function getLocalizedText(value: unknown, fallback = 'Untitled'): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const map = value as Record<string, string>;
    return map.en || map.sv || Object.values(map)[0] || fallback;
  }
  return fallback;
}

const CONTENT_IMAGES: Record<string, string> = {
  ballroom: '/images/Banquet Grand.webp',
  banquet: '/images/Banquet Grand.webp',
  boardroom: '/images/Boardroom Grand.jpg',
  conference: '/images/microphone and speakers.webp',
  meeting: '/images/Boardroom Medium.jpg',
  restaurant: '/images/Dinner.jpg',
  dining: '/images/Dinner.jpg',
  garden: '/images/decoration.jpeg',
  outdoor: '/images/decoration.jpeg',
  suite: '/images/Suite Room.webp',
  single: '/images/Single Room.webp',
  double: '/images/Double Room.jpg',
  room: '/images/Double Room.jpg',
  wedding: '/images/decoration.jpeg',
  breakfast: '/images/Breakfast.webp',
  lunch: '/images/lunch.webp',
  dinner: '/images/Dinner.jpg',
  coffee: '/images/Coffee and Snacks.avif',
  snack: '/images/Coffee and Snacks.avif',
  catering: '/images/Coffee and Snacks.avif',
  'full board': '/images/Full Board All Meals.webp',
  meal: '/images/Full Board All Meals.webp',
  projector: '/images/Projector.jpg',
  microphone: '/images/microphone and speakers.webp',
  speaker: '/images/microphone and speakers.webp',
  transport: '/images/transportation.jpg',
  decoration: '/images/decoration.jpeg',
};

const DEFAULT_CONTENT_IMAGE = '/images/Boardroom Grand.jpg';

function getContentImage(item: ContentItem): string {
  // Use API image if available
  if (item.images && item.images.length > 0) {
    const img = item.images[0] as { url?: string; thumbnail_url?: string };
    if (img.url || img.thumbnail_url) return (img.url || img.thumbnail_url) as string;
  }
  // Match by title keywords
  const title = getLocalizedText(item.title, '').toLowerCase();
  for (const [keyword, url] of Object.entries(CONTENT_IMAGES)) {
    if (title.includes(keyword)) return url;
  }
  return DEFAULT_CONTENT_IMAGE;
}

export default function ContentPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data, error, isLoading, mutate } = useContent({ include_archived: showArchived });
  const { data: companiesData } = useCompanies();
  const defaultCompanyId = (companiesData?.data?.[0]?.id as number | undefined) ?? undefined;

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({ title: '', description: '' });
  const [editForm, setEditForm] = useState({ title: '', description: '' });
  const [selectedVariationIds, setSelectedVariationIds] = useState<number[]>([]);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);

  const content: ContentItem[] = data?.data
    ? Array.isArray(data.data) ? data.data : [data.data]
    : [];

  const filtered = content.filter((item) => {
    if (!search) return true;
    const title = getLocalizedText(item.title, '');
    const description = getLocalizedText(item.description, '');
    return `${title} ${description}`.toLowerCase().includes(search.toLowerCase());
  });

  const visibleVariationIds = useMemo(
    () => filtered
      .map((item) => item.variation_id)
      .filter((id): id is number => typeof id === 'number'),
    [filtered],
  );

  useEffect(() => {
    setSelectedVariationIds((current) => {
      const next = current.filter((id) => visibleVariationIds.includes(id));
      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current;
      }
      return next;
    });
  }, [visibleVariationIds]);

  async function handleCreate() {
    if (!defaultCompanyId) return;
    setCreating(true);
    try {
      await apiPost('/api/proposales/content', {
        company_id: defaultCompanyId,
        language: 'en',
        title: form.title,
        description: form.description || undefined,
      });
      setShowCreate(false);
      setForm({ title: '', description: '' });
      setSelectedVariationIds([]);
      mutate();
    } finally {
      setCreating(false);
    }
  }

  function openEdit(item: ContentItem) {
    setEditingItem(item);
    setEditForm({
      title: getLocalizedText(item.title),
      description: getLocalizedText(item.description, ''),
    });
    setShowEdit(true);
  }

  async function handleEditSave() {
    if (!editingItem?.variation_id) return;
    setSavingEdit(true);
    try {
      await apiPut('/api/proposales/content', {
        variation_id: editingItem.variation_id,
        language: 'en',
        title: editForm.title,
        description: editForm.description || undefined,
      });
      setShowEdit(false);
      setEditingItem(null);
      mutate();
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(item: ContentItem) {
    const variationId = item.variation_id;
    if (!variationId) return;
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Delete this content item? This cannot be undone.')
      : false;
    if (!confirmed) return;

    setActioning(true);
    try {
      await apiDelete(`/api/proposales/content?variation_id=${variationId}`);
      setSelectedVariationIds((current) => current.filter((id) => id !== variationId));
      mutate();
    } finally {
      setActioning(false);
    }
  }

  async function archiveByVariationIds(variationIds: number[]) {
    if (variationIds.length === 0) return;
    setActioning(true);
    try {
      await apiDelete('/api/proposales/content?action=bulk', { variation_ids: variationIds });
      setSelectedVariationIds((current) => current.filter((id) => !variationIds.includes(id)));
      mutate();
    } finally {
      setActioning(false);
    }
  }

  async function restoreByVariationIds(variationIds: number[]) {
    if (variationIds.length === 0) return;
    setActioning(true);
    try {
      await apiPost('/api/proposales/content?action=restore', { variation_ids: variationIds });
      setSelectedVariationIds((current) => current.filter((id) => !variationIds.includes(id)));
      mutate();
    } finally {
      setActioning(false);
    }
  }

  function toggleSelect(variationId?: number) {
    if (!variationId) return;
    setSelectedVariationIds((current) => (
      current.includes(variationId)
        ? current.filter((id) => id !== variationId)
        : [...current, variationId]
    ));
  }

  function toggleSelectAllVisible() {
    const everySelected = visibleVariationIds.length > 0
      && visibleVariationIds.every((id) => selectedVariationIds.includes(id));
    if (everySelected) {
      setSelectedVariationIds((current) => current.filter((id) => !visibleVariationIds.includes(id)));
      return;
    }
    setSelectedVariationIds((current) => Array.from(new Set([...current, ...visibleVariationIds])));
  }

  const allVisibleSelected = visibleVariationIds.length > 0
    && visibleVariationIds.every((id) => selectedVariationIds.includes(id));

  const columns: Column<ContentItem>[] = [
    {
      key: 'select',
      header: '',
      className: 'w-10',
      render: (item) => (
        <input
          type="checkbox"
          checked={!!item.variation_id && selectedVariationIds.includes(item.variation_id)}
          onChange={() => toggleSelect(item.variation_id)}
        />
      ),
    },
    {
      key: 'title',
      header: 'Content Item',
      render: (item) => (
        <div className="flex items-center gap-3">
          <img
            src={getContentImage(item)}
            alt={getLocalizedText(item.title)}
            className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
          />
          <div>
            <p className="font-medium text-gray-900">{getLocalizedText(item.title)}</p>
            <p className="text-xs text-gray-400">ID: {item.product_id ?? '—'} · Var: {item.variation_id ?? '—'}</p>
          </div>
        </div>
      ),
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
          {item.created_at ? formatDate(item.created_at) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openEdit(item)}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
          {item.is_archived ? (
            <button
              type="button"
              onClick={() => restoreByVariationIds(item.variation_id ? [item.variation_id] : [])}
              className="rounded border border-amber-200 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={() => archiveByVariationIds(item.variation_id ? [item.variation_id] : [])}
              className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
            >
              Archive
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDelete(item)}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Content Library"
        description="Manage reusable content blocks for proposals"
        actions={<Button onClick={() => setShowCreate(true)}>+ New Content</Button>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Input
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Badge variant="default">{filtered.length} items</Badge>
        <label className="ml-2 flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
              setSelectedVariationIds([]);
            }}
          />
          Show archived
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-gray-200 bg-white p-3">
        <button
          type="button"
          onClick={toggleSelectAllVisible}
          className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          {allVisibleSelected ? 'Unselect all visible' : 'Select all visible'}
        </button>
        <Badge variant="outline">{selectedVariationIds.length} selected</Badge>
        <Button
          variant="secondary"
          onClick={() => archiveByVariationIds(selectedVariationIds)}
          disabled={selectedVariationIds.length === 0 || actioning}
        >
          Bulk Archive
        </Button>
        <Button
          variant="secondary"
          onClick={() => restoreByVariationIds(selectedVariationIds)}
          disabled={selectedVariationIds.length === 0 || actioning}
        >
          Restore Content
        </Button>
      </div>

      {error && (
        <div className="rounded-card border border-error-200 bg-error-50 p-4">
          <p className="text-sm text-error-700">{error.message}</p>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={(item) => String(item.variation_id ?? item.product_id ?? Math.random())}
        loading={isLoading || actioning}
        emptyMessage="No content items found."
      />

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
          <Button onClick={handleCreate} loading={creating} disabled={!form.title || !defaultCompanyId}>
            Create
          </Button>
        </ModalFooter>
      </Modal>

      <Modal open={showEdit} onClose={() => setShowEdit(false)}>
        <ModalHeader>
          <ModalTitle>Edit Content Item</ModalTitle>
        </ModalHeader>
        <div className="space-y-4">
          <Input
            label="Title"
            required
            value={editForm.title}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            placeholder="Enter content title"
          />
          <Textarea
            label="Description"
            value={editForm.description}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            placeholder="Enter description"
            rows={4}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowEdit(false)}>
            Cancel
          </Button>
          <Button onClick={handleEditSave} loading={savingEdit} disabled={!editForm.title || !editingItem?.variation_id}>
            Save
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
