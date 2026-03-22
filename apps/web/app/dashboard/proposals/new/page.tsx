'use client';

import { useEffect, useMemo, useState } from 'react';
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

interface CalendarDay {
  date: string;
  day: number;
  dow: number;
  status: 'available' | 'limited' | 'booked';
  available_count: number;
  total_count: number;
}

interface CalendarHold {
  date: string;
  space_id: string;
  space_name: string;
  expires_at: string;
  status: string;
}

interface AvailabilityResult {
  space_id: string;
  space_name: string;
  space_type: string;
  capacity: number;
  date: string;
  time_slot: string;
  time_slot_id: string;
  price: string;
  price_cents: number;
  amenities: string[];
}

interface SelectedBlock {
  id: number;
  title: string;
  description: string;
  imageUrl?: string;
  quantity: number;
  priceAdjustmentPercent?: number; // e.g., 10 for +10%, -15 for -15%
}

interface CustomField {
  id: string;
  label: string;
  value: string;
}

const DEFAULT_PREVIEW_IMAGE = '/images/Banquet%20Grand.webp';

const EVENT_TILES = [
  { value: 'conference', label: 'Conference', icon: '🎤' },
  { value: 'wedding', label: 'Wedding', icon: '💍' },
  { value: 'meeting', label: 'Meeting', icon: '🤝' },
  { value: 'dinner', label: 'Dinner / Gala', icon: '🍽️' },
  { value: 'party', label: 'Party', icon: '🎉' },
  { value: 'seminar', label: 'Seminar', icon: '🎓' },
  { value: 'workshop', label: 'Workshop', icon: '📋' },
  { value: 'accommodation', label: 'Stay', icon: '🛏️' },
];

const VENUE_TILES = [
  { value: 'room', label: 'Hotel Room', icon: '🏨', desc: 'Luxury stay' },
  { value: 'boardroom', label: 'Boardroom', icon: '💼', desc: '10–20 pax' },
  { value: 'conference', label: 'Conference', icon: '🖥️', desc: '30–50 pax' },
  { value: 'banquet', label: 'Banquet Hall', icon: '🎊', desc: '100–500 pax' },
  { value: 'garden', label: 'Garden', icon: '🌿', desc: 'Open air' },
  { value: 'restaurant', label: 'Restaurant', icon: '🍷', desc: 'Fine dining' },
];

const VENUE_IMAGES: Record<string, { url: string; label: string }> = {
  room: {
    url: '/images/Double%20Room.jpg',
    label: 'Hotel Room',
  },
  boardroom: {
    url: '/images/Boardroom%20Grand.jpg',
    label: 'Boardroom',
  },
  conference: {
    url: '/images/microphone%20and%20speakers.webp',
    label: 'Conference Room',
  },
  banquet: {
    url: '/images/Banquet%20Grand.webp',
    label: 'Banquet Hall',
  },
  garden: {
    url: '/images/decoration.jpeg',
    label: 'Garden',
  },
  restaurant: {
    url: '/images/Dinner.jpg',
    label: 'Restaurant',
  },
  suite: {
    url: '/images/Suite%20Room.webp',
    label: 'Suite Room',
  },
};

const TIME_SLOTS = [
  { value: 'morning', label: 'Morning (8:00–12:00)' },
  { value: 'afternoon', label: 'Afternoon (12:00–17:00)' },
  { value: 'evening', label: 'Evening (17:00–22:00)' },
  { value: 'full-day', label: 'Full Day' },
];

function normalizeTitleText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildShortTitleFallback(eventTypeRaw?: string, venueTypeRaw?: string): string {
  const eventType = normalizeTitleText(eventTypeRaw || 'event');
  const venueType = normalizeTitleText(venueTypeRaw || '');

  if (eventType.includes('wedding')) return 'Banquet Wedding Reception';
  if (eventType.includes('conference')) {
    if (venueType.includes('banquet')) return 'Banquet Conference Session';
    if (venueType.includes('boardroom')) return 'Boardroom Conference Session';
    return 'Corporate Conference Session';
  }
  if (eventType.includes('meeting')) return 'Executive Meeting Session';
  if (eventType.includes('accommodation') || eventType.includes('stay')) return 'Cozy Weekend Stay';
  if (eventType.includes('dinner') || eventType.includes('gala')) return 'Elegant Gala Dinner';
  if (eventType.includes('party') || eventType.includes('reception')) return 'Private Reception Event';

  return 'Premium Event Experience';
}

function getVenueImage(venueType?: string | null): { url: string; label: string } | null {
  if (!venueType) return null;
  return VENUE_IMAGES[venueType] || null;
}

function sanitizeAiTitle(candidate: string, eventTypeRaw?: string, venueTypeRaw?: string): string {
  const cleaned = candidate
    .split('\n')[0]
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(Boolean);
  if (words.length >= 3 && words.length <= 5) return words.join(' ');
  if (words.length > 5) return words.slice(0, 5).join(' ');

  return buildShortTitleFallback(eventTypeRaw, venueTypeRaw);
}

function getDefaultQuantityForBlock(titleRaw: string, guestsRaw: string): number {
  const title = normalizeTitleText(titleRaw);
  const guestsNum = Number(guestsRaw);
  const guests = Number.isFinite(guestsNum) && guestsNum > 0 ? Math.floor(guestsNum) : 1;

  const isMeal = ['lunch', 'dinner', 'breakfast', 'all meals', 'full board', 'coffee', 'snacks'].some((k) => title.includes(k));
  if (isMeal) return guests;

  const isRoom = ['single room', 'double room', 'suite room', 'suite'].some((k) => title.includes(k));
  if (isRoom) {
    if (title.includes('double room')) return Math.max(1, Math.ceil(guests / 2));
    return guests;
  }

  return 1;
}

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
    venueType: '',
    timeSlot: '',
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

  // PMS Calendar
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [calendarHolds, setCalendarHolds] = useState<CalendarHold[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarSummary, setCalendarSummary] = useState<{ available: number; limited: number; booked: number; active_holds: number } | null>(null);
  const [availability, setAvailability] = useState<AvailabilityResult[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<AvailabilityResult | null>(null);

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

  // Calendar fetch
  useEffect(() => {
    setCalendarLoading(true);
    const params = new URLSearchParams({ year: String(calendarMonth.year), month: String(calendarMonth.month) });
    if (form.guests) params.set('guests', form.guests);
    fetch(`/api/mock-pms/calendar?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setCalendarDays(data.days ?? []);
          setCalendarHolds(data.holds ?? []);
          setCalendarSummary(data.summary ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setCalendarLoading(false));
  }, [calendarMonth.year, calendarMonth.month, form.guests]);

  // Live availability
  useEffect(() => {
    if (!form.eventDate || !form.guests) { setAvailability([]); return; }
    setAvailabilityLoading(true);
    const params = new URLSearchParams({ date: form.eventDate, guests: form.guests });
    if (form.eventType) params.set('event_type', form.eventType);
    if (form.timeSlot) params.set('time_slot', form.timeSlot);
    fetch(`/api/mock-pms/availability?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setAvailability(data?.results ?? []))
      .catch(() => {})
      .finally(() => setAvailabilityLoading(false));
  }, [form.eventDate, form.guests, form.eventType, form.timeSlot]);

  const prevMonth = () =>
    setCalendarMonth((p) => (p.month === 1 ? { year: p.year - 1, month: 12 } : { ...p, month: p.month - 1 }));
  const nextMonth = () =>
    setCalendarMonth((p) => (p.month === 12 ? { year: p.year + 1, month: 1 } : { ...p, month: p.month + 1 }));

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
        ? `${context}. Generate ONLY a premium proposal title in STRICT 4 to 5 words, one line only, no markdown, no extra text.`
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
      const spaceType = selectedSpace?.space_type || form.venueType;
      const title = buildShortTitleFallback(form.eventType, spaceType);
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
    const defaultQuantity = getDefaultQuantityForBlock(title, form.guests);

    setSelectedBlocks((current) => {
      const existing = current.find((entry) => entry.id === item.variation_id);
      if (existing) {
        return current.map((entry) => entry.id === item.variation_id
          ? { ...entry, quantity: entry.quantity + defaultQuantity }
          : entry);
      }
      return [
        ...current,
        { id: item.variation_id, title, description, imageUrl, quantity: defaultQuantity },
      ];
    });
  }

  useEffect(() => {
    if (!selectedSpace) return;
    const spaceName = normalizeTitleText(selectedSpace.space_name || '');
    if (!spaceName) return;

    const matchedContent = contentItems.find((item) => {
      const title = normalizeTitleText(item.title?.en || Object.values(item.title || {})[0] || '');
      return title.includes(spaceName) || spaceName.includes(title);
    });

    if (!matchedContent) return;
    setSelectedBlocks((current) => {
      if (current.some((entry) => entry.id === matchedContent.variation_id)) return current;
      const title = matchedContent.title?.en || Object.values(matchedContent.title || {})[0] || 'Untitled item';
      const description = matchedContent.description?.en || Object.values(matchedContent.description || {})[0] || '';
      const imageUrl = matchedContent.images?.[0]?.url;
      return [
        ...current,
        { id: matchedContent.variation_id, title, description, imageUrl, quantity: 1 },
      ];
    });
  }, [selectedSpace, contentItems]);

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

  function handleApplyAIPricing() {
    if (!pricingInsight) return;
    // Apply the AI pricing adjustment (seasonMultiplier) to all blocks
    const adjustmentPercent = Math.round((pricingInsight.seasonMultiplier - 1) * 100);
    setSelectedBlocks((current) =>
      current.map((block) => ({
        ...block,
        priceAdjustmentPercent: adjustmentPercent,
      })),
    );
  }

  function updateBlockPriceAdjustment(id: number, adjustmentPercent: number) {
    setSelectedBlocks((current) =>
      current.map((block) =>
        block.id === id ? { ...block, priceAdjustmentPercent: adjustmentPercent } : block,
      ),
    );
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
        blocks: selectedBlocks.map((block) => ({
          content_id: block.id,
          quantity: block.quantity,
          price_adjustment_percent: block.priceAdjustmentPercent ?? 0,
        })),
        attachments: attachmentPayload.length > 0 ? attachmentPayload : undefined,
        data: {
          event_type: form.eventType || undefined,
          event_date: form.eventDate || undefined,
          guests: form.guests ? parseInt(form.guests, 10) : undefined,
          venue_type: form.venueType || undefined,
          time_slot: form.timeSlot || undefined,
          space_id: selectedSpace?.space_id || undefined,
          space_name: selectedSpace?.space_name || undefined,
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
        // Book the selected PMS space
        if (selectedSpace) {
          fetch('/api/mock-pms/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              space_id: selectedSpace.space_id,
              date: form.eventDate,
              time_slot_id: selectedSpace.time_slot_id,
              guests: form.guests ? parseInt(form.guests, 10) : 1,
              contact_email: form.contactEmail || creatorEmail,
              proposal_uuid: uuid,
            }),
          }).catch(() => {});
        }
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
  const previewVenueImage = getVenueImage(selectedSpace?.space_type || form.venueType);
  const previewHeroImage = form.heroImageUrl
    || previewVenueImage?.url
    || selectedBlocks.find((block) => block.imageUrl)?.imageUrl
    || DEFAULT_PREVIEW_IMAGE;

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
            <CardContent className="space-y-5">
              {/* Event type tiles */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">Event Type *</label>
                <div className="grid grid-cols-4 gap-2">
                  {EVENT_TILES.map((et) => (
                    <button
                      key={et.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, eventType: et.value }))}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-center transition-all',
                        form.eventType === et.value
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-200 bg-white hover:border-gray-300',
                      )}
                    >
                      <span className="text-2xl">{et.icon}</span>
                      <span className={cn('text-[11px] font-medium leading-tight', form.eventType === et.value ? 'text-gray-900' : 'text-gray-600')}>
                        {et.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Venue tiles */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">Venue / Space Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {VENUE_TILES.map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, venueType: v.value }))}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all',
                        form.venueType === v.value
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-200 bg-white hover:border-gray-300',
                      )}
                    >
                      <span className="text-2xl">{v.icon}</span>
                      <div>
                        <p className={cn('text-sm font-medium', form.venueType === v.value ? 'text-gray-900' : 'text-gray-700')}>{v.label}</p>
                        <p className="text-xs text-gray-500">{v.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date / time / guests */}
              <div className="grid gap-4 md:grid-cols-3">
                <Input
                  label="Event Date"
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, eventDate: e.target.value }))}
                />
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Time Slot</label>
                  <select
                    value={form.timeSlot}
                    onChange={(e) => setForm((prev) => ({ ...prev, timeSlot: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                  >
                    <option value="">Any time</option>
                    {TIME_SLOTS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
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

          {/* ─── Availability Calendar ─── */}
          <Card>
            <CardHeader>
              <CardTitle>Availability Calendar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                {/* Month nav */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-200 transition-colors">
                    <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  </button>
                  <span className="text-sm font-semibold text-gray-800">
                    {new Date(calendarMonth.year, calendarMonth.month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                  <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-gray-200 transition-colors">
                    <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </button>
                </div>

                {calendarLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" />
                  </div>
                ) : (
                  <>
                    {/* Day labels */}
                    <div className="grid grid-cols-7 text-center border-b border-gray-100">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                        <div key={d} className="py-1.5 text-[10px] font-semibold text-gray-400 uppercase">{d}</div>
                      ))}
                    </div>
                    {/* Day cells */}
                    <div className="grid grid-cols-7 gap-px bg-gray-100 p-px">
                      {calendarDays.length > 0 && Array.from({ length: calendarDays[0].dow }).map((_, i) => (
                        <div key={`e-${i}`} className="bg-white h-9" />
                      ))}
                      {calendarDays.map((day) => {
                        const isSelected = form.eventDate === day.date;
                        const held = calendarHolds.find((h) => h.date === day.date);
                        return (
                          <button
                            key={day.date}
                            type="button"
                            onClick={() => { if (day.status !== 'booked') setForm((prev) => ({ ...prev, eventDate: day.date })); }}
                            disabled={day.status === 'booked'}
                            title={day.status === 'booked' ? 'Fully booked' : `${day.available_count}/${day.total_count} slots`}
                            className={cn(
                              'relative h-9 text-xs font-medium transition-all flex items-center justify-center',
                              isSelected
                                ? 'bg-gray-900 text-white'
                                : day.status === 'available'
                                  ? 'bg-white text-gray-800 hover:bg-green-50'
                                  : day.status === 'limited'
                                    ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                                    : 'bg-red-50 text-red-300 cursor-not-allowed',
                            )}
                          >
                            {day.day}
                            <span
                              className={cn(
                                'absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full',
                                isSelected
                                  ? 'bg-white'
                                  : day.status === 'available'
                                    ? 'bg-green-400'
                                    : day.status === 'limited'
                                      ? 'bg-amber-400'
                                      : 'bg-red-400',
                              )}
                            />
                            {held && !isSelected && <span className="absolute top-0 right-0.5 text-[8px]">🔒</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Legend */}
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-100 text-[10px]">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400" />Available</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />Limited</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />Booked</span>
                  </div>
                  {calendarSummary && (
                    <span className="text-gray-500">
                      {calendarSummary.available}✓ {calendarSummary.limited}⚠ {calendarSummary.booked}✕
                      {calendarSummary.active_holds > 0 && ` ${calendarSummary.active_holds}🔒`}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Space Availability ─── */}
          {form.eventDate && form.guests && (
            <Card>
              <CardHeader>
                <CardTitle>Space Availability</CardTitle>
              </CardHeader>
              <CardContent>
                {availabilityLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
                    Checking live availability...
                  </div>
                ) : availability.length === 0 ? (
                  <p className="text-sm text-gray-500">No spaces available for the selected date and guest count.</p>
                ) : (
                  <div className="space-y-2">
                    {availability.map((slot) => {
                      const isSelected =
                        selectedSpace?.space_id === slot.space_id && selectedSpace?.time_slot_id === slot.time_slot_id;
                      return (
                        <button
                          key={`${slot.space_id}-${slot.time_slot_id}`}
                          type="button"
                          onClick={() => setSelectedSpace(isSelected ? null : slot)}
                          className={cn(
                            'w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all',
                            isSelected ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-300',
                          )}
                        >
                          <div>
                            <p className={cn('text-sm font-semibold', isSelected ? 'text-gray-900' : 'text-gray-800')}>
                              {slot.space_name}
                              {isSelected && <span className="ml-2 text-xs font-medium text-green-600">✓ Selected</span>}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {slot.time_slot} · Up to {slot.capacity} guests
                              {slot.amenities?.length > 0 && ` · ${slot.amenities.slice(0, 3).join(', ')}`}
                            </p>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <p className="text-sm font-bold text-gray-900">{slot.price}</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{slot.space_type}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>AI Copy Studio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">Proposal Title</label>
                  <Button variant="secondary" onClick={handleGenerateTitle} loading={generatingTitle}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-5.25a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
                    </svg>
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
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-5.25a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
                    </svg>
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
                  <Button onClick={handleApplyAIPricing} variant="primary" className="w-full">
                    Apply AI Pricing to Blocks
                  </Button>
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
                  <div key={block.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3">
                    <div className="flex items-start gap-3">
                      {block.imageUrl ? (
                        <img src={block.imageUrl} alt={block.title} className="h-20 w-20 rounded-lg object-cover" />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900">{block.title}</div>
                        <div className="mt-1 text-xs text-gray-500">{block.description}</div>
                      </div>
                      <Button variant="secondary" onClick={() => removeBlock(block.id)}>
                        Remove
                      </Button>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-2">
                      <div className="flex items-end gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                          <input
                            type="number"
                            min={1}
                            value={block.quantity}
                            onChange={(e) => updateBlockQuantity(block.id, Number(e.target.value))}
                            className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Price Adjustment (%)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step={1}
                            value={block.priceAdjustmentPercent ?? 0}
                            onChange={(e) => updateBlockPriceAdjustment(block.id, Number(e.target.value))}
                            placeholder="0"
                            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          />
                          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                            {block.priceAdjustmentPercent ?? 0 > 0 ? '+' : ''}{block.priceAdjustmentPercent ?? 0}%
                          </span>
                        </div>
                      </div>
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
                  <img
                    src={previewHeroImage}
                    alt={previewTitle}
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = DEFAULT_PREVIEW_IMAGE;
                    }}
                  />
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
