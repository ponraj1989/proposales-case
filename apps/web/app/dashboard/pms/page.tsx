'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@proposales/ui';
import { useContent } from '@/lib/hooks';

// ─── Title-based image mapping for content items ───

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

function getContentImageByTitle(title: string, images?: unknown[]): string {
  if (images && Array.isArray(images) && images.length > 0) {
    const img = images[0] as { url?: string; thumbnail_url?: string };
    if (img.url || img.thumbnail_url) return (img.url || img.thumbnail_url) as string;
  }
  const lower = title.toLowerCase();
  for (const [keyword, url] of Object.entries(CONTENT_IMAGES)) {
    if (lower.includes(keyword)) return url;
  }
  return DEFAULT_CONTENT_IMAGE;
}

// ─── Types ───

interface Venue {
  id: string;
  name: string;
  location: string;
  description: string;
}

interface Space {
  id: string;
  venue_id: string;
  name: string;
  type: string;
  capacity: number;
  base_price_cents: number;
  amenities: string[];
  description: string;
}

interface TimeSlot {
  id: string;
  label: string;
  start: string;
  end: string;
}

interface CalendarDay {
  date: string;
  day: number;
  dow: number;
  status: 'available' | 'limited' | 'booked';
  available_count: number;
  total_count: number;
}

interface Hold {
  date: string;
  space_id: string;
  space_name: string;
  time_slot_id: string;
  expires_at: string;
  status: string;
}

interface CalendarData {
  year: number;
  month: number;
  month_name: string;
  days: CalendarDay[];
  holds: Hold[];
  summary: { available: number; limited: number; booked: number; active_holds: number };
}

interface AvailabilityResult {
  space_id: string;
  space_name: string;
  space_type: string;
  capacity: number;
  date: string;
  time_slot: string;
  time_slot_id: string;
  price_cents: number;
  price: string;
  amenities: string[];
}

// ─── Helpers ───

const SPACE_TYPE_ICONS: Record<string, string> = {
  banquet: '🏛️',
  boardroom: '📋',
  outdoor: '🌿',
  conference: '🎤',
  restaurant: '🍽️',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  available: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  limited: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  booked: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

function formatEUR(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const d = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (d <= 0) return 'Expired';
  if (d === 1) return '1 day';
  return `${d} days`;
}

// ─── Main Page ───

export default function PmsPage() {
  const [tab, setTab] = useState<'spaces' | 'calendar' | 'availability' | 'holds'>('spaces');
  const { data: contentData } = useContent();
  const contentItems = contentData?.data ? (Array.isArray(contentData.data) ? contentData.data : []) : [];
  const [venue, setVenue] = useState<Venue | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [calSpace, setCalSpace] = useState<string>('');
  const [availResults, setAvailResults] = useState<AvailabilityResult[]>([]);
  const [availQuery, setAvailQuery] = useState({ date: '', guests: '10', event_type: '', time_slot: '' });
  const [loading, setLoading] = useState(true);
  const [calLoading, setCalLoading] = useState(false);
  const [availLoading, setAvailLoading] = useState(false);

  // Fetch venue data on mount
  useEffect(() => {
    fetch('/api/mock-pms/venue')
      .then((r) => r.json())
      .then((data) => {
        setVenue(data.venue);
        setSpaces(data.spaces ?? []);
        setTimeSlots(data.time_slots ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch calendar when month/space changes
  const fetchCalendar = useCallback(async () => {
    setCalLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(calMonth.year),
        month: String(calMonth.month),
      });
      if (calSpace) params.set('space_id', calSpace);
      const r = await fetch(`/api/mock-pms/calendar?${params}`);
      const data = await r.json();
      setCalendar(data);
    } catch { /* ignore */ }
    setCalLoading(false);
  }, [calMonth, calSpace]);

  useEffect(() => {
    if (tab === 'calendar' || tab === 'holds') {
      fetchCalendar();
    }
  }, [tab, fetchCalendar]);

  // Check availability
  const checkAvailability = async () => {
    if (!availQuery.date || !availQuery.guests) return;
    setAvailLoading(true);
    try {
      const params = new URLSearchParams({ date: availQuery.date, guests: availQuery.guests });
      if (availQuery.event_type) params.set('event_type', availQuery.event_type);
      if (availQuery.time_slot) params.set('time_slot', availQuery.time_slot);
      const r = await fetch(`/api/mock-pms/availability?${params}`);
      const data = await r.json();
      setAvailResults(data.results ?? []);
    } catch { /* ignore */ }
    setAvailLoading(false);
  };

  const tabs = [
    { key: 'spaces', label: 'Spaces', icon: '🏨' },
    { key: 'calendar', label: 'Calendar', icon: '📅' },
    { key: 'availability', label: 'Availability', icon: '🔍' },
    { key: 'holds', label: 'Holds', icon: '🔒' },
  ] as const;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Property Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          {venue?.name ?? 'Hotel'} — {venue?.location ?? ''} · {contentItems.length} content items
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Spaces Tab ─── */}
      {tab === 'spaces' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard label="Total Items" value={contentItems.length} />
            <SummaryCard label="Categories" value={[...new Set(contentItems.map((c: Record<string, unknown>) => c.product_id))].length} />
            <SummaryCard label="With Images" value={contentItems.filter((c: Record<string, unknown>) => Array.isArray(c.images) && c.images.length > 0).length} />
            <SummaryCard label="Time Slots" value={timeSlots.length} />
          </div>

          {/* Content items from Proposales API */}
          {contentItems.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
              <span className="text-4xl">📦</span>
              <p className="mt-3 text-sm font-medium text-gray-700">No content available</p>
              <p className="mt-1 text-xs text-gray-400">Content items from Proposales will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {contentItems.map((item: Record<string, unknown>, idx: number) => {
                const title = item.title
                  ? (typeof item.title === 'string' ? item.title : (item.title as Record<string, string>).en || Object.values(item.title as Record<string, string>)[0] || 'Untitled')
                  : 'Untitled';
                const desc = item.description
                  ? (typeof item.description === 'string' ? item.description : (item.description as Record<string, string>).en || Object.values(item.description as Record<string, string>)[0] || '')
                  : '';
                const images = Array.isArray(item.images) ? item.images : [];
                const thumb = images[0]?.url || images[0]?.thumbnail_url;
                const variationId = item.variation_id ?? item.id;
                const productId = item.product_id;
                return (
                  <div key={String(variationId ?? idx)} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                    <div className="h-40 w-full bg-gray-100">
                      <img src={getContentImageByTitle(String(title), images)} alt={String(title)} className="h-full w-full object-cover" />
                    </div>
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <h3 className="text-sm font-semibold text-gray-900 line-clamp-1">{String(title)}</h3>
                        {Boolean(item.is_archived) && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-500">Archived</span>
                        )}
                      </div>
                      {desc && <p className="mt-1 text-xs text-gray-500 line-clamp-2">{String(desc)}</p>}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {productId ? <span className="rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-600">Product #{String(productId)}</span> : null}
                        {variationId ? <span className="rounded-full bg-purple-50 border border-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-600">Variation #{String(variationId)}</span> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Time Slots */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Time Slots</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {timeSlots.map((slot) => (
                <div key={slot.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                  <p className="text-sm font-medium text-gray-900">{slot.label}</p>
                  <p className="text-xs text-gray-500">{slot.start} – {slot.end}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Calendar Tab ─── */}
      {tab === 'calendar' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() =>
                setCalMonth((p) => {
                  const d = new Date(p.year, p.month - 2, 1);
                  return { year: d.getFullYear(), month: d.getMonth() + 1 };
                })
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              ← Prev
            </button>
            <span className="text-sm font-semibold text-gray-900 min-w-[140px] text-center">
              {calendar?.month_name ?? ''} {calMonth.year}
            </span>
            <button
              onClick={() =>
                setCalMonth((p) => {
                  const d = new Date(p.year, p.month, 1);
                  return { year: d.getFullYear(), month: d.getMonth() + 1 };
                })
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              Next →
            </button>

            <select
              value={calSpace}
              onChange={(e) => setCalSpace(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">All Spaces</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Summary */}
          {calendar && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryCard label="Available Days" value={calendar.summary.available} color="text-green-600" />
              <SummaryCard label="Limited Days" value={calendar.summary.limited} color="text-amber-600" />
              <SummaryCard label="Fully Booked" value={calendar.summary.booked} color="text-red-600" />
              <SummaryCard label="Active Holds" value={calendar.summary.active_holds} color="text-blue-600" />
            </div>
          )}

          {/* Calendar grid */}
          {calLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            </div>
          ) : calendar ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {/* Leading blanks */}
                {Array.from({ length: calendar.days[0]?.dow ?? 0 }).map((_, i) => (
                  <div key={`blank-${i}`} />
                ))}
                {calendar.days.map((day) => {
                  const sc = STATUS_COLORS[day.status];
                  return (
                    <div
                      key={day.date}
                      className={cn(
                        'rounded-lg p-2 text-center transition-colors',
                        sc.bg,
                      )}
                      title={`${day.date}: ${day.available_count}/${day.total_count} slots available`}
                    >
                      <p className={cn('text-sm font-medium', sc.text)}>{day.day}</p>
                      <p className="text-[0.6rem] text-gray-500">
                        {day.available_count}/{day.total_count}
                      </p>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                {Object.entries(STATUS_COLORS).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className={cn('h-2.5 w-2.5 rounded-full', val.dot)} />
                    <span className="capitalize">{key}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ─── Availability Tab ─── */}
      {tab === 'availability' && (
        <div className="space-y-4">
          {/* Query form */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Check Availability</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date</label>
                <input
                  type="date"
                  value={availQuery.date}
                  onChange={(e) => setAvailQuery((p) => ({ ...p, date: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Guests</label>
                <input
                  type="number"
                  min={1}
                  value={availQuery.guests}
                  onChange={(e) => setAvailQuery((p) => ({ ...p, guests: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Event Type</label>
                <select
                  value={availQuery.event_type}
                  onChange={(e) => setAvailQuery((p) => ({ ...p, event_type: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">Any</option>
                  <option value="wedding">Wedding</option>
                  <option value="conference">Conference</option>
                  <option value="dinner">Dinner</option>
                  <option value="meeting">Meeting</option>
                  <option value="party">Party</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Time Slot</label>
                <select
                  value={availQuery.time_slot}
                  onChange={(e) => setAvailQuery((p) => ({ ...p, time_slot: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">Any</option>
                  {timeSlots.map((ts) => (
                    <option key={ts.id} value={ts.id}>{ts.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={checkAvailability}
                  disabled={availLoading || !availQuery.date}
                  className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {availLoading ? 'Checking…' : 'Search'}
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          {availResults.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {availResults.map((r, i) => (
                <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{SPACE_TYPE_ICONS[r.space_type] ?? '🏠'}</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.space_name}</p>
                        <p className="text-xs text-gray-500 capitalize">{r.space_type} · {r.capacity} pax</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{r.price}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5">{r.time_slot}</span>
                    <span>{r.date}</span>
                  </div>
                  {r.amenities.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.amenities.slice(0, 3).map((a) => (
                        <span key={a} className="rounded-full bg-gray-50 border border-gray-100 px-2 py-0.5 text-[0.6rem] text-gray-500">{a}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {availResults.length === 0 && availQuery.date && !availLoading && (
            <p className="text-center text-sm text-gray-400 py-8">No results. Try a different date or guest count.</p>
          )}
        </div>
      )}

      {/* ─── Holds Tab ─── */}
      {tab === 'holds' && (
        <div className="space-y-4">
          {calLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            </div>
          ) : calendar && calendar.holds.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Active Holds — {calendar.month_name} {calendar.year}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Spaces temporarily reserved pending proposal acceptance (7-day expiry)</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase">
                    <th className="text-left px-5 py-2">Space</th>
                    <th className="text-left px-5 py-2">Date</th>
                    <th className="text-left px-5 py-2">Time Slot</th>
                    <th className="text-left px-5 py-2">Expires</th>
                    <th className="text-left px-5 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {calendar.holds.map((h, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{h.space_name}</td>
                      <td className="px-5 py-3 text-gray-600">{h.date}</td>
                      <td className="px-5 py-3 capitalize text-gray-600">{h.time_slot_id}</td>
                      <td className="px-5 py-3 text-gray-600">{daysUntil(h.expires_at)}</td>
                      <td className="px-5 py-3">
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          h.status === 'held' ? 'bg-blue-100 text-blue-700' :
                          h.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                          h.status === 'expired' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600',
                        )}>
                          {h.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
              <span className="text-4xl">🔓</span>
              <p className="mt-3 text-sm font-medium text-gray-700">No active holds this month</p>
              <p className="mt-1 text-xs text-gray-400">Holds are created when proposals are generated and expire after 7 days</p>
            </div>
          )}

          {/* Month nav for holds */}
          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                setCalMonth((p) => {
                  const d = new Date(p.year, p.month - 2, 1);
                  return { year: d.getFullYear(), month: d.getMonth() + 1 };
                })
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              ← Prev Month
            </button>
            <span className="text-sm text-gray-600">{calendar?.month_name ?? ''} {calMonth.year}</span>
            <button
              onClick={() =>
                setCalMonth((p) => {
                  const d = new Date(p.year, p.month, 1);
                  return { year: d.getFullYear(), month: d.getMonth() + 1 };
                })
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              Next Month →
            </button>
          </div>
        </div>
      )}

      
    </div>
  );
}

// ─── Small Components ───

function SummaryCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold', color ?? 'text-gray-900')}>{value}</p>
    </div>
  );
}
