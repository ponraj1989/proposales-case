'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PageHeader,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@proposales/ui';
import { cn } from '@proposales/ui';
import {
  apiPost,
  useAttachments,
  useCompanies,
  useCompanyTemplates,
  useContent,
  useUser,
} from '@/lib/hooks';

interface ContentRecord {
  variation_id: number;
  title: Record<string, string>;
  description: Record<string, string>;
  images?: Array<{ uuid: string; url?: string; filename?: string }>;
}

interface AttachmentRecord {
  id: number;
  filename: string;
}

interface TemplateRecord {
  uuid: string;
  title: string;
  language: string;
  background_image_uuid?: string;
}

interface ExternalAttachment {
  id: string;
  mime_type: 'text/html' | 'application/pdf';
  name: string;
  url: string;
}

interface PricingInsight {
  strategy: 'premium' | 'standard' | 'value';
  seasonMultiplier: number;
  reasoning: string;
  tips: string[];
  suggestedDiscount: number;
}

interface SelectedBlock {
  id: number;
  title: string;
  description: string;
  imageUrl?: string;
  quantity: number;
}

interface CustomField {
  id: string;
  label: string;
  value: string;
}

const EVENT_OPTIONS = [
  'conference',
  'wedding',
  'meeting',
  'dinner',
  'seminar',
  'party',
  'accommodation',
];

export default function NewProposalBuilderPage() {
  const router = useRouter();
  const { data: userData } = useUser();
  const { data: companiesData } = useCompanies();
  const { data: contentData } = useContent();
  const { data: attachmentsData } = useAttachments();

  const companies: Array<{ id: number; name: string; currency: string }> = companiesData?.data ?? [];
  const defaultCompany = companies[0];
  const { data: templatesData } = useCompanyTemplates(defaultCompany?.id ?? 0);
  const contentItems: ContentRecord[] = contentData?.data ?? [];
  const attachments: AttachmentRecord[] = attachmentsData?.data ?? [];
  const templates: TemplateRecord[] = templatesData?.data ?? [];

  const [saving, setSaving] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingPricing, setGeneratingPricing] = useState(false);
  const [contentSearch, setContentSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    eventType: '',
    eventDate: '',
    guests: '',
    contactName: '',
    contactEmail: '',
    contactCompany: '',
    contactPhone: '',
    creatorEmail: '',
    internalContactEmail: '',
    title: '',
    description: '',
    notes: '',
    invoicingEnabled: false,
    taxMode: 'standard' as 'standard' | 'simplified' | 'tax-free' | 'none',
    taxIncluded: true,
    taxLabel: 'VAT',
    heroImageUrl: '',
    heroImageUuid: '',
    backgroundImageId: '',
    backgroundImageUuid: '',
    backgroundVideoId: '',
    backgroundVideoUuid: '',
  });
  const [selectedBlocks, setSelectedBlocks] = useState<SelectedBlock[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<number[]>([]);
  const [externalAttachments, setExternalAttachments] = useState<ExternalAttachment[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [pricingInsight, setPricingInsight] = useState<PricingInsight | null>(null);

  const filteredContent = useMemo(() => {
    const query = contentSearch.trim().toLowerCase();
    if (!query) return contentItems;
    return contentItems.filter((item) => {
      const title = item.title?.en || Object.values(item.title || {})[0] || '';
      const description = item.description?.en || Object.values(item.description || {})[0] || '';
      return `${title} ${description}`.toLowerCase().includes(query);
    });
  }, [contentItems, contentSearch]);

  const imageLibrary = useMemo(
    () => contentItems.flatMap((item) => (item.images ?? []).map((img) => ({
      uuid: img.uuid,
      url: img.url,
      title: item.title?.en || Object.values(item.title || {})[0] || 'Content image',
    }))).filter((img) => !!img.url),
    [contentItems],
  );

  async function runAIGeneration(mode: 'title' | 'description' | 'pricing') {
    const contentPayload = selectedBlocks.map((block) => ({ title: block.title, quantity: block.quantity }));
    const context = [
      form.contactCompany ? `Company: ${form.contactCompany}` : '',
      form.notes ? `Notes: ${form.notes}` : '',
      selectedBlocks.length > 0 ? `Selected content: ${selectedBlocks.map((block) => block.title).join(', ')}` : '',
    ].filter(Boolean).join('. ');

    const body = {
      mode: mode === 'pricing' ? 'pricing' : undefined,
      title: form.title || form.eventType || 'Hotel Event Proposal',
      eventType: form.eventType,
      guests: form.guests ? Number(form.guests) : undefined,
      date: form.eventDate || undefined,
      context: mode === 'title'
        ? `${context}. Generate ONLY a short proposal title, max 80 chars, no markdown.`
        : context,
      contentItems: contentPayload,
    };

    const response = await fetch('/api/ai/generate-description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error('AI generation failed');
    }

    return response.json();
  }

  async function handleGenerateTitle() {
    setGeneratingTitle(true);
    try {
      const data = await runAIGeneration('title');
      const title = String(data.description || '')
        .split('\n')[0]
        .replace(/^#+\s*/, '')
        .replace(/\*\*/g, '')
        .trim();
      setForm((prev) => ({ ...prev, title }));
    } catch {
      setError('Failed to generate a title.');
    } finally {
      setGeneratingTitle(false);
    }
  }

  async function handleGenerateDescription() {
    setGeneratingDescription(true);
    try {
      const data = await runAIGeneration('description');
      setForm((prev) => ({ ...prev, description: String(data.description || '') }));
    } catch {
      setError('Failed to generate a description.');
    } finally {
      setGeneratingDescription(false);
    }
  }

  async function handleGeneratePricing() {
    setGeneratingPricing(true);
    try {
      const data = await runAIGeneration('pricing');
      setPricingInsight(data.pricing as PricingInsight);
    } catch {
      setError('Failed to generate pricing guidance.');
    } finally {
      setGeneratingPricing(false);
    }
  }

  function addBlock(item: ContentRecord) {
    const title = item.title?.en || Object.values(item.title || {})[0] || 'Untitled item';
    const description = item.description?.en || Object.values(item.description || {})[0] || '';
    const imageUrl = item.images?.[0]?.url;

    setSelectedBlocks((current) => {
      const existing = current.find((entry) => entry.id === item.variation_id);
      if (existing) {
        return current.map((entry) => entry.id === item.variation_id
          ? { ...entry, quantity: entry.quantity + 1 }
          : entry);
      }
      return [
        ...current,
        { id: item.variation_id, title, description, imageUrl, quantity: 1 },
      ];
    });
  }

  function updateBlockQuantity(id: number, quantity: number) {
    setSelectedBlocks((current) => current
      .map((entry) => entry.id === id ? { ...entry, quantity: Math.max(1, quantity) } : entry));
  }

  function removeBlock(id: number) {
    setSelectedBlocks((current) => current.filter((entry) => entry.id !== id));
  }

  function addCustomField() {
    setCustomFields((current) => [
      ...current,
      { id: crypto.randomUUID(), label: '', value: '' },
    ]);
  }

  function updateCustomField(id: string, key: 'label' | 'value', value: string) {
    setCustomFields((current) => current.map((field) => (
      field.id === id ? { ...field, [key]: value } : field
    )));
  }

  function removeCustomField(id: string) {
    setCustomFields((current) => current.filter((field) => field.id !== id));
  }

  function addExternalAttachment(mime_type: 'text/html' | 'application/pdf') {
    setExternalAttachments((current) => [
      ...current,
      { id: crypto.randomUUID(), mime_type, name: '', url: '' },
    ]);
  }

  function updateExternalAttachment(id: string, key: 'name' | 'url' | 'mime_type', value: string) {
    setExternalAttachments((current) => current.map((attachment) => (
      attachment.id === id
        ? { ...attachment, [key]: value }
        : attachment
    )));
  }

  function removeExternalAttachment(id: string) {
    setExternalAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  async function handleCreateProposal() {
    if (!defaultCompany) return;
    setSaving(true);
    setError(null);

    try {
      const nameParts = form.contactName.trim().split(' ');
      const firstName = nameParts[0] || undefined;
      const lastName = nameParts.slice(1).join(' ') || undefined;
      const creatorEmail = form.creatorEmail.trim() || userData?.email || undefined;
      const internalContactEmail = form.internalContactEmail.trim() || creatorEmail;
      const metadataFields = Object.fromEntries(
        customFields
          .filter((field) => field.label.trim())
          .map((field) => [field.label.trim(), field.value.trim()]),
      );
      const attachmentPayload = [
        ...selectedAttachmentIds.map((id) => ({ id })),
        ...externalAttachments
          .filter((attachment) => attachment.name.trim() && attachment.url.trim())
          .map((attachment) => ({
            mime_type: attachment.mime_type,
            name: attachment.name.trim(),
            url: attachment.url.trim(),
          })),
      ];
      const backgroundImage = form.backgroundImageId.trim() && form.backgroundImageUuid.trim()
        ? { id: Number(form.backgroundImageId), uuid: form.backgroundImageUuid.trim() }
        : undefined;
      const backgroundVideo = form.backgroundVideoId.trim() && form.backgroundVideoUuid.trim()
        ? { id: Number(form.backgroundVideoId), uuid: form.backgroundVideoUuid.trim() }
        : undefined;

      const payload: Record<string, unknown> = {
        company_id: defaultCompany.id,
        language: 'en',
        creator_email: creatorEmail,
        title_md: form.title || undefined,
        description_md: form.description || undefined,
        contact_email: internalContactEmail,
        background_image: backgroundImage,
        background_video: backgroundVideo,
        recipient: {
          first_name: firstName,
          last_name: lastName,
          email: form.contactEmail || undefined,
          phone: form.contactPhone || undefined,
          company_name: form.contactCompany || undefined,
        },
        blocks: selectedBlocks.map((block) => ({ content_id: block.id })),
        attachments: attachmentPayload.length > 0 ? attachmentPayload : undefined,
        data: {
          event_type: form.eventType || undefined,
          event_date: form.eventDate || undefined,
          guests: form.guests ? parseInt(form.guests, 10) : undefined,
          notes: form.notes || undefined,
          status: 'draft',
          negotiation_round: 0,
          discount_applied: 0,
          custom_fields: metadataFields,
          hero_image_url: form.heroImageUrl || undefined,
          hero_image_uuid: form.heroImageUuid || undefined,
          selected_content_items: selectedBlocks.map((block) => ({
            variation_id: block.id,
            title: block.title,
            quantity: block.quantity,
          })),
          pricing_strategy: pricingInsight?.strategy,
          pricing_reasoning: pricingInsight?.reasoning,
          season_multiplier: pricingInsight?.seasonMultiplier,
          suggested_discount: pricingInsight?.suggestedDiscount,
          creator_email: creatorEmail,
          internal_contact_email: internalContactEmail,
        },
        invoicing_enabled: form.invoicingEnabled,
        tax_options: {
          mode: form.taxMode,
          tax_included: form.taxIncluded,
          tax_label_key: form.taxLabel || undefined,
        },
      };

      const result = await apiPost('/api/proposales/proposals', payload);
      const uuid = result?.proposal?.uuid;
      if (uuid) {
        router.push(`/dashboard/proposals/${uuid}`);
        return;
      }
      router.push('/dashboard/proposals');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create proposal.');
    } finally {
      setSaving(false);
    }
  }

  const previewTitle = form.title || 'Untitled proposal';
  const previewRecipient = form.contactName || 'Recipient not set';

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Proposal Builder"
        description="CMS-style proposal creation with AI-assisted copy, pricing guidance, content blocks, and custom fields."
        actions={
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => router.push('/dashboard/proposals')}>
              Back
            </Button>
            <Button onClick={handleCreateProposal} loading={saving}>
              Create Proposal
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-card border border-error-200 bg-error-50 p-4 text-sm text-error-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Event Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Event Type</label>
                  <select
                    value={form.eventType}
                    onChange={(e) => setForm((prev) => ({ ...prev, eventType: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                  >
                    <option value="">Select type...</option>
                    {EVENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Event Date"
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, eventDate: e.target.value }))}
                />
                <Input
                  label="Guest Count"
                  type="number"
                  value={form.guests}
                  onChange={(e) => setForm((prev) => ({ ...prev, guests: e.target.value }))}
                  placeholder="120"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Recipient Name"
                  value={form.contactName}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))}
                  placeholder="Sarah Johnson"
                />
                <Input
                  label="Recipient Email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                  placeholder="sarah@company.com"
                />
                <Input
                  label="Company"
                  value={form.contactCompany}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactCompany: e.target.value }))}
                  placeholder="Northwind Group"
                />
                <Input
                  label="Phone"
                  value={form.contactPhone}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                  placeholder="+46 70 123 4567"
                />
                <Input
                  label="Creator Email"
                  type="email"
                  value={form.creatorEmail}
                  onChange={(e) => setForm((prev) => ({ ...prev, creatorEmail: e.target.value }))}
                  placeholder={userData?.email || 'sales@hotel.com'}
                />
                <Input
                  label="Internal Contact Email"
                  type="email"
                  value={form.internalContactEmail}
                  onChange={(e) => setForm((prev) => ({ ...prev, internalContactEmail: e.target.value }))}
                  placeholder={userData?.email || 'account.manager@hotel.com'}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Copy Studio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">Proposal Title</label>
                  <Button variant="secondary" onClick={handleGenerateTitle} loading={generatingTitle}>
                    AI Title
                  </Button>
                </div>
                <input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Luxury Summer Wedding Weekend"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">Context / Description</label>
                  <Button variant="secondary" onClick={handleGenerateDescription} loading={generatingDescription}>
                    AI Description
                  </Button>
                </div>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={6}
                  placeholder="Describe the experience, venue positioning, guest journey, and inclusions."
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Sales Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  placeholder="Special requests, upsell angle, venue positioning, negotiation notes."
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Pricing Guidance</CardTitle>
                <Button variant="secondary" onClick={handleGeneratePricing} loading={generatingPricing}>
                  AI Pricing
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {pricingInsight ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Metric label="Strategy" value={pricingInsight.strategy} />
                    <Metric label="Season Multiplier" value={`${pricingInsight.seasonMultiplier.toFixed(2)}x`} />
                    <Metric label="Negotiation Buffer" value={`${pricingInsight.suggestedDiscount}%`} />
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                    {pricingInsight.reasoning}
                  </div>
                  <div className="grid gap-2">
                    {pricingInsight.tips.map((tip) => (
                      <div key={tip} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">
                        {tip}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                  Generate AI pricing to get a season-aware pricing posture, multiplier, and negotiation advice.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Background Media</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Background Image ID"
                  type="number"
                  value={form.backgroundImageId}
                  onChange={(e) => setForm((prev) => ({ ...prev, backgroundImageId: e.target.value }))}
                  placeholder="Template asset ID"
                />
                <Input
                  label="Background Image UUID"
                  value={form.backgroundImageUuid}
                  onChange={(e) => setForm((prev) => ({ ...prev, backgroundImageUuid: e.target.value }))}
                  placeholder="Template asset UUID"
                />
                <Input
                  label="Background Video ID"
                  type="number"
                  value={form.backgroundVideoId}
                  onChange={(e) => setForm((prev) => ({ ...prev, backgroundVideoId: e.target.value }))}
                  placeholder="Video asset ID"
                />
                <Input
                  label="Background Video UUID"
                  value={form.backgroundVideoUuid}
                  onChange={(e) => setForm((prev) => ({ ...prev, backgroundVideoUuid: e.target.value }))}
                  placeholder="Video asset UUID"
                />
              </div>
              {templates.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 text-xs font-medium text-gray-600">Available Templates</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {templates.slice(0, 6).map((template) => (
                      <div key={template.uuid} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{template.title}</div>
                        <div className="text-xs text-gray-500">{template.language} · {template.background_image_uuid || 'No image uuid'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                {imageLibrary.slice(0, 9).map((image) => (
                  <button
                    key={image.uuid}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, heroImageUrl: image.url || '', heroImageUuid: image.uuid }))}
                    className={cn(
                      'overflow-hidden rounded-xl border text-left transition hover:border-gray-400',
                      form.heroImageUuid === image.uuid ? 'border-gray-900 ring-2 ring-gray-200' : 'border-gray-200',
                    )}
                  >
                    <div className="aspect-[4/3] bg-gray-100">
                      <img src={image.url} alt={image.title} className="h-full w-full object-cover" />
                    </div>
                    <div className="px-3 py-2 text-xs font-medium text-gray-700">{image.title}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Content Blocks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Search rooms, packages, catering, AV..."
                value={contentSearch}
                onChange={(e) => setContentSearch(e.target.value)}
              />
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredContent.slice(0, 12).map((item) => {
                  const title = item.title?.en || Object.values(item.title || {})[0] || 'Untitled';
                  const description = item.description?.en || Object.values(item.description || {})[0] || '';
                  const image = item.images?.[0]?.url;
                  return (
                    <div key={item.variation_id} className="rounded-xl border border-gray-200 bg-white p-3">
                      {image ? (
                        <div className="mb-3 aspect-[16/9] overflow-hidden rounded-lg bg-gray-100">
                          <img src={image} alt={title} className="h-full w-full object-cover" />
                        </div>
                      ) : null}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{title}</div>
                          <div className="mt-1 text-xs text-gray-500">{description}</div>
                        </div>
                        <Button variant="secondary" onClick={() => addBlock(item)}>
                          Add
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 rounded-xl border border-dashed border-gray-300 p-4">
                <div className="text-sm font-semibold text-gray-900">Selected blocks</div>
                {selectedBlocks.length === 0 ? (
                  <div className="text-sm text-gray-500">No blocks selected yet.</div>
                ) : selectedBlocks.map((block) => (
                  <div key={block.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3 md:flex-row md:items-center">
                    {block.imageUrl ? (
                      <img src={block.imageUrl} alt={block.title} className="h-20 w-full rounded-lg object-cover md:w-32" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900">{block.title}</div>
                      <div className="mt-1 text-xs text-gray-500">{block.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={block.quantity}
                        onChange={(e) => updateBlockQuantity(block.id, Number(e.target.value))}
                        className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <Button variant="secondary" onClick={() => removeBlock(block.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attachments & Custom Fields</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-medium text-gray-600">Attachments</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {attachments.slice(0, 10).map((attachment) => {
                    const active = selectedAttachmentIds.includes(attachment.id);
                    return (
                      <button
                        key={attachment.id}
                        type="button"
                        onClick={() => setSelectedAttachmentIds((current) => active
                          ? current.filter((id) => id !== attachment.id)
                          : [...current, attachment.id])}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-left text-sm transition',
                          active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700',
                        )}
                      >
                        {attachment.filename}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-gray-600">External Attachments</div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => addExternalAttachment('text/html')}>Add Link</Button>
                    <Button variant="secondary" onClick={() => addExternalAttachment('application/pdf')}>Add PDF</Button>
                  </div>
                </div>
                {externalAttachments.length === 0 ? (
                  <div className="text-sm text-gray-500">Add HTML links or PDF URLs to fully cover the create-proposal attachments API.</div>
                ) : externalAttachments.map((attachment) => (
                  <div key={attachment.id} className="grid gap-2 md:grid-cols-[160px_1fr_1fr_auto]">
                    <select
                      value={attachment.mime_type}
                      onChange={(e) => updateExternalAttachment(attachment.id, 'mime_type', e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="text/html">HTML Link</option>
                      <option value="application/pdf">PDF URL</option>
                    </select>
                    <Input
                      placeholder="Attachment name"
                      value={attachment.name}
                      onChange={(e) => updateExternalAttachment(attachment.id, 'name', e.target.value)}
                    />
                    <Input
                      placeholder="https://example.com/file"
                      value={attachment.url}
                      onChange={(e) => updateExternalAttachment(attachment.id, 'url', e.target.value)}
                    />
                    <Button variant="secondary" onClick={() => removeExternalAttachment(attachment.id)}>Remove</Button>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-gray-600">Custom Fields</div>
                  <Button variant="secondary" onClick={addCustomField}>Add Field</Button>
                </div>
                {customFields.length === 0 ? (
                  <div className="text-sm text-gray-500">Add custom metadata fields for internal CMS-style structure.</div>
                ) : customFields.map((field) => (
                  <div key={field.id} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                    <Input
                      placeholder="Field label"
                      value={field.label}
                      onChange={(e) => updateCustomField(field.id, 'label', e.target.value)}
                    />
                    <Input
                      placeholder="Field value"
                      value={field.value}
                      onChange={(e) => updateCustomField(field.id, 'value', e.target.value)}
                    />
                    <Button variant="secondary" onClick={() => removeCustomField(field.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing Rules</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.invoicingEnabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, invoicingEnabled: e.target.checked }))}
                />
                Enable invoicing
              </label>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Tax Mode</label>
                <select
                  value={form.taxMode}
                  onChange={(e) => setForm((prev) => ({ ...prev, taxMode: e.target.value as typeof form.taxMode }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="standard">Standard</option>
                  <option value="simplified">Simplified</option>
                  <option value="tax-free">Tax-free</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Tax Included</label>
                <select
                  value={form.taxIncluded ? 'yes' : 'no'}
                  onChange={(e) => setForm((prev) => ({ ...prev, taxIncluded: e.target.value === 'yes' }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="yes">Included</option>
                  <option value="no">Excluded</option>
                </select>
              </div>
              <Input
                label="Tax Label"
                value={form.taxLabel}
                onChange={(e) => setForm((prev) => ({ ...prev, taxLabel: e.target.value }))}
                placeholder="VAT"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="aspect-[16/9] bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500">
                  {form.heroImageUrl ? (
                    <img src={form.heroImageUrl} alt={previewTitle} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-gray-400">Proposal Preview</div>
                    <h2 className="mt-2 text-2xl font-semibold text-gray-900">{previewTitle}</h2>
                    <p className="mt-1 text-sm text-gray-500">Prepared for {previewRecipient}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap">
                    {form.description || 'Your AI-generated or manually written proposal description will appear here.'}
                  </div>
                  <div className="space-y-2">
                    {selectedBlocks.map((block) => (
                      <div key={block.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                        <span>{block.title}</span>
                        <span className="text-gray-400">x{block.quantity}</span>
                      </div>
                    ))}
                    {selectedBlocks.length === 0 && (
                      <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500">
                        Add content blocks to shape the proposal.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Builder Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600">
              <SummaryRow label="Company" value={defaultCompany?.name || 'No company available'} />
              <SummaryRow label="Blocks" value={String(selectedBlocks.length)} />
              <SummaryRow label="Attachments" value={String(selectedAttachmentIds.length)} />
              <SummaryRow label="Custom Fields" value={String(customFields.length)} />
              <SummaryRow label="Pricing Mode" value={pricingInsight?.strategy || 'Not generated'} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-2 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
