'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  PageHeader,
  Button,
  Input,
  Textarea,
  Badge,
  StatusBadge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  formatCurrency,
  formatDate,
} from '@proposales/ui';
import { useProposal, apiPut, useContent } from '@/lib/hooks';

interface EditBlock {
  uuid: string;
  content_id?: number;
  title: string;
  type: string;
  quantity: number;
  removed: boolean;
}

export default function ProposalDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useProposal(uuid);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generatingDesc, setGeneratingDesc] = useState(false);

  const proposal = data?.data as Record<string, unknown> | undefined;

  const { data: contentData } = useContent();
  const contentItems: { variation_id: number; title: Record<string, string> }[] = contentData?.data ?? [];

  const [formData, setFormData] = useState({
    title_md: '',
    description_md: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    recipient_company_name: '',
  });
  const [editBlocks, setEditBlocks] = useState<EditBlock[]>([]);
  const [addBlockId, setAddBlockId] = useState<string>('');

  function startEdit() {
    if (proposal) {
      setFormData({
        title_md: (proposal.title_md as string) ?? '',
        description_md: (proposal.description_md as string) ?? '',
        contact_name: (proposal.contact_name as string) ?? '',
        contact_email: (proposal.contact_email as string) ?? '',
        contact_phone: (proposal.contact_phone as string) ?? '',
        recipient_company_name: (proposal.recipient_company_name as string) ?? '',
      });
      const blocks = Array.isArray(proposal.blocks)
        ? (proposal.blocks as Record<string, unknown>[]).map((b) => ({
            uuid: (b.uuid as string) || '',
            content_id: b.content_id as number | undefined,
            title: (b.title || `Block`) as string,
            type: (b.type || 'product-block') as string,
            quantity: (b.quantity as number) ?? 1,
            removed: false,
          }))
        : [];
      setEditBlocks(blocks);
    }
    setSaveError(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      // Build recipient object
      const nameParts = formData.contact_name.split(' ');
      const firstName = nameParts[0] || undefined;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

      // Build blocks array from edit state (only content_id blocks can be sent)
      const blockPayload = editBlocks
        .filter((b) => !b.removed && b.content_id)
        .map((b) => ({ content_id: b.content_id! }));

      const payload: Record<string, unknown> = {
        title_md: formData.title_md || undefined,
        description_md: formData.description_md || undefined,
        contact_email: formData.contact_email || undefined,
        recipient: {
          first_name: firstName,
          last_name: lastName,
          email: formData.contact_email || undefined,
          phone: formData.contact_phone || undefined,
          company_name: formData.recipient_company_name || undefined,
        },
      };

      // Only include blocks if they were edited
      if (editBlocks.length > 0) {
        payload.blocks = blockPayload;
      }

      await apiPut(`/api/proposales/proposals/${uuid}`, payload);
      setEditing(false);
      mutate();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateDescription() {
    setGeneratingDesc(true);
    try {
      const res = await fetch('/api/ai/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title_md,
          context: formData.contact_name
            ? `Client: ${formData.contact_name}, Company: ${formData.recipient_company_name}`
            : undefined,
        }),
      });
      if (res.ok) {
        const { description } = await res.json();
        setFormData((prev) => ({ ...prev, description_md: description }));
      }
    } catch {
      // TODO: toast
    } finally {
      setGeneratingDesc(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-64 w-full animate-pulse rounded bg-gray-200" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="p-6">
        <div className="rounded-card border border-error-200 bg-error-50 p-6">
          <p className="text-sm font-medium text-error-700">
            {error?.message ?? 'Proposal not found'}
          </p>
          <Button variant="outline" className="mt-3" onClick={() => router.push('/dashboard/proposals')}>
            ← Back to Proposals
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={editing ? 'Edit Proposal' : ((proposal.title_md || 'Untitled Proposal') as string)}
        description={`UUID: ${uuid}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/dashboard/proposals')}>
              ← Back
            </Button>
            {!editing ? (
              <>
                <Button variant="secondary" onClick={() => mutate()}>
                  ↻ Refresh
                </Button>
                <Button onClick={startEdit}>Edit</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} loading={saving}>
                  Save Changes
                </Button>
              </>
            )}
          </div>
        }
      />

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">Save failed: {saveError}</p>
        </div>
      )}

      {/* Info Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Card */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Proposal Details</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-4">
                  <Input
                    label="Title"
                    value={formData.title_md}
                    onChange={(e) => setFormData({ ...formData, title_md: e.target.value })}
                  />
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-gray-700">Description</label>
                      <Button
                        variant="secondary"
                        onClick={handleGenerateDescription}
                        loading={generatingDesc}
                        className="text-xs"
                      >
                        ✨ AI Generate
                      </Button>
                    </div>
                    <Textarea
                      value={formData.description_md}
                      onChange={(e) => setFormData({ ...formData, description_md: e.target.value })}
                      rows={6}
                      placeholder={generatingDesc ? 'Generating hotel description...' : 'Enter proposal description or click AI Generate'}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Title</label>
                    <p className="mt-1 text-gray-900">{(proposal.title_md ?? 'Untitled') as string}</p>
                  </div>
                  {proposal.description_md ? (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">Description</label>
                      <p className="mt-1 text-gray-700 whitespace-pre-wrap">{proposal.description_md as string}</p>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">Status</label>
                      <div className="mt-1"><StatusBadge status={proposal.status as string} /></div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">Version</label>
                      <div className="mt-1"><Badge variant="outline">v{(proposal.version ?? 1) as number}</Badge></div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">Language</label>
                      <p className="mt-1 text-gray-700">{(proposal.language ?? '—') as string}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase">Currency</label>
                      <p className="mt-1 text-gray-700">{(proposal.currency ?? '—') as string}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Blocks */}
          {editing ? (
            <Card>
              <CardHeader>
                <CardTitle>Blocks ({editBlocks.filter(b => !b.removed).length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {editBlocks.map((block, i) => block.removed ? null : (
                    <div key={block.uuid || i} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{block.title}</p>
                        <p className="text-xs text-gray-500">{block.type}{block.content_id ? ` · Content #${block.content_id}` : ''}</p>
                      </div>
                      <button
                        onClick={() => {
                          setEditBlocks(prev => prev.map((b, idx) =>
                            idx === i ? { ...b, removed: true } : b
                          ));
                        }}
                        className="shrink-0 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {editBlocks.filter(b => !b.removed).length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No blocks — add content below</p>
                  )}
                  {/* Add block from content library */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <select
                      value={addBlockId}
                      onChange={(e) => setAddBlockId(e.target.value)}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                    >
                      <option value="">Select content to add...</option>
                      {contentItems.map((item) => (
                        <option key={item.variation_id} value={String(item.variation_id)}>
                          {item.title?.en || Object.values(item.title || {})[0] || `Content #${item.variation_id}`}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      disabled={!addBlockId}
                      onClick={() => {
                        const cid = parseInt(addBlockId, 10);
                        const found = contentItems.find(c => c.variation_id === cid);
                        const title = found?.title?.en || Object.values(found?.title || {})[0] || `Content #${cid}`;
                        setEditBlocks(prev => [...prev, {
                          uuid: `new-${Date.now()}`,
                          content_id: cid,
                          title: String(title),
                          type: 'product-block',
                          quantity: 1,
                          removed: false,
                        }]);
                        setAddBlockId('');
                      }}
                    >
                      + Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : Array.isArray(proposal.blocks) && (proposal.blocks as unknown[]).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Blocks ({(proposal.blocks as unknown[]).length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(proposal.blocks as Record<string, unknown>[]).map((block, i) => (
                    <div key={block.uuid as string || i} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{(block.title || `Block ${i + 1}`) as string}</p>
                        <p className="text-xs text-gray-500">{block.type as string}</p>
                      </div>
                      <div className="text-right">
                        {block.unit_value_with_discount_with_tax != null ? (
                          <p className="text-sm font-medium tabular-nums">
                            {formatCurrency(block.unit_value_with_discount_with_tax as number, (proposal.currency as string) || 'EUR')}
                          </p>
                        ) : null}
                        {block.quantity != null ? (
                          <p className="text-xs text-gray-500">Qty: {block.quantity as number}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Value */}
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Total Value</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {formatCurrency((proposal.value_with_tax as number) || 0, (proposal.currency as string) || 'EUR')}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {formatCurrency((proposal.value_without_tax as number) || 0, (proposal.currency as string) || 'EUR')} excl. tax
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-3">
                  <Input
                    label="Contact Name"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  />
                  <Input
                    label="Phone"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  />
                  <Input
                    label="Company"
                    value={formData.recipient_company_name}
                    onChange={(e) => setFormData({ ...formData, recipient_company_name: e.target.value })}
                  />
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="text-gray-900 font-medium">{(proposal.contact_name || '—') as string}</p>
                  <p className="text-gray-600">{(proposal.contact_email || '—') as string}</p>
                  <p className="text-gray-600">{(proposal.contact_phone || '—') as string}</p>
                  <p className="text-gray-500">{(proposal.recipient_company_name || '—') as string}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tracking */}
          {proposal.tracking ? (
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {(proposal.tracking as Record<string, unknown>).sent_at ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Sent</span>
                      <span>{formatDate(new Date((proposal.tracking as Record<string, unknown>).sent_at as string).getTime() / 1000)}</span>
                    </div>
                  ) : null}
                  {(proposal.tracking as Record<string, unknown>).first_viewed_at ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500">First viewed</span>
                      <span>{formatDate(new Date((proposal.tracking as Record<string, unknown>).first_viewed_at as string).getTime() / 1000)}</span>
                    </div>
                  ) : null}
                  {(proposal.tracking as Record<string, unknown>).number_of_views != null ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Views</span>
                      <span>{(proposal.tracking as Record<string, unknown>).number_of_views as number}</span>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Signatures */}
          {Array.isArray(proposal.signatures) && (proposal.signatures as unknown[]).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Signatures</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(proposal.signatures as Record<string, unknown>[]).map((sig, i) => (
                    <div key={i} className="rounded-lg bg-success-50 border border-success-200 p-3">
                      <p className="text-sm font-medium text-success-700">{sig.name as string}</p>
                      <p className="text-xs text-success-600">{sig.date as string}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

    </div>
  );
}
