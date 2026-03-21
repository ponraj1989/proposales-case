'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { type UIMessage, DefaultChatTransport } from 'ai';
import { cn } from '@proposales/ui';
import { ChartCard, type ChartConfig } from '@/components/chat/ChartCard';
import { useUser } from '@/lib/hooks';
import { QRCodeSVG } from 'qrcode.react';

// ─── Types ───

interface ToolPart {
  type: string;
  toolName: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

interface ProposalDraft {
  type: 'proposal_draft';
  title: string;
  description: string;
  items: {
    name: string;
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    content_id?: number;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  recipient: { name: string; email: string; company: string };
  company_id: number;
  language: string;
  notes: string;
  venue_type?: string | null;
  negotiation_round: number;
  max_negotiation_rounds: number;
  discount_applied: number;
  is_final_offer?: boolean;
  proposalUuid?: string | null;
  proposalUrl?: string | null;
}

interface StoredConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
}

// ─── Rich Tool Result Types ───

interface AvailabilityOption {
  space_name: string;
  time_slot: string;
  date: string;
  capacity: number;
  base_price: number;
  total_price: number;
  currency: string;
  utilization: number;
  features?: string[];
  image_url?: string;
}

interface AvailabilityResult {
  type: 'availability';
  query: { date: string; guests: number; event_type: string; time_slot: string };
  options: AvailabilityOption[];
}

interface PricingResult {
  type: string;
  space_name: string;
  base_price: number;
  total_price: number;
  currency: string;
  breakdown: { factor: string; multiplier: number }[];
}

interface SearchItem {
  uuid?: string;
  title?: string;
  title_md?: string;
  status?: string;
  value_with_tax?: number;
  currency?: string;
  contact_name?: string;
  recipient_name?: string;
}

interface SearchResultSet {
  type: 'proposals';
  items: SearchItem[];
  total: number;
}

// ─── New Rich Result Types ───

interface CalendarDay {
  date: string;
  day: number;
  dow: number;
  status: 'available' | 'limited' | 'booked';
  slots_available: number;
  slots_total: number;
}

interface CalendarResult {
  type: 'availability_calendar';
  year: number;
  month: number;
  month_name: string;
  space_name: string;
  days: CalendarDay[];
  summary: { available: number; limited: number; booked: number };
}

interface FloorPlanResult {
  type: 'floor_plan';
  space_name: string;
  space_type: string;
  layout: string;
  guests: number;
  max_capacity_for_layout: number;
  fits: boolean;
  recommendation: string;
  layouts_available: { layout: string; max_capacity: number; fits_guests: boolean }[];
}

interface UserInputOption {
  value: string;
  label: string;
  icon?: string;
}

interface UserInputField {
  name: string;
  label: string;
  type: 'select' | 'date' | 'number' | 'text' | 'toggle_group';
  required?: boolean;
  placeholder?: string;
  options?: UserInputOption[];
  min?: number;
  max?: number;
  default_value?: string;
}

interface UserInputRequest {
  type: 'user_input_request';
  title: string;
  description?: string;
  fields: UserInputField[];
}

// ─── Language options ───

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
];

// ─── LocalStorage helpers (user-scoped) ───

function getStorageKey(userId?: string | null): string {
  return userId ? `proposales_conversations_${userId}` : 'proposales_conversations';
}

let _currentStorageKey = 'proposales_conversations';

function setCurrentUser(userId?: string | null) {
  _currentStorageKey = getStorageKey(userId);
}

function loadConversations(): StoredConversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(_currentStorageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistConversations(conversations: StoredConversation[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(_currentStorageKey, JSON.stringify(conversations));
}

function persistConversation(id: string, title: string, messages: UIMessage[]) {
  const convs = loadConversations();
  const idx = convs.findIndex((c) => c.id === id);
  const now = Date.now();
  if (idx >= 0) {
    convs[idx].messages = messages;
    convs[idx].updatedAt = now;
    if (title) convs[idx].title = title;
  } else {
    convs.unshift({ id, title, createdAt: now, updatedAt: now, messages });
  }
  persistConversations(convs);
}

function deleteStoredConversation(id: string) {
  const convs = loadConversations().filter((c) => c.id !== id);
  persistConversations(convs);
}

// ─── Suggestions ───

const SALES_SUGGESTIONS = [
  'Create a proposal for a hotel meeting room with 10 members with food and accommodation',
  'Create a conference proposal for 50 attendees with AV equipment',
  'Show me a chart of proposals by status',
  'Visualize revenue trend by month',
  'Show my win rate trend over time',
  'What are my top companies by proposal count?',
  'Show a pipeline funnel of my proposals',
  'Analyze my sales pipeline',
];

const GUEST_SUGGESTIONS = [
  'What conference rooms are available for a team meeting?',
  'I want to book a wedding venue for 200 guests',
  'What are the prices for the banquet hall?',
  'Tell me about your hotel rooms and suites',
  'I need a conference room with AV equipment for 30 people',
  'What dining and catering options do you offer?',
];

// ─── Main Component ───

export default function AIAssistantPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState('');
  const [chatMode, setChatMode] = useState<'conversation' | 'form'>('conversation');
  const [language, setLanguage] = useState('en');
  const [isListening, setIsListening] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { data: userData } = useUser();
  const isSales = userData?.role === 'sales';
  const suggestions = isSales ? SALES_SUGGESTIONS : GUEST_SUGGESTIONS;

  // Scope localStorage to current user
  useEffect(() => {
    if (userData?.userId) {
      setCurrentUser(userData.userId);
    }
  }, [userData?.userId]);

  // Initialize conversations from localStorage (re-run when user changes)
  useEffect(() => {
    if (userData?.userId) {
      setCurrentUser(userData.userId);
    }
    const stored = loadConversations();
    setConversations(stored);
    if (stored.length > 0) {
      setActiveConvId(stored[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.userId]);

  const activeConversation = conversations.find((c) => c.id === activeConvId);

  const {
    messages,
    sendMessage,
    status,
    setMessages,
  } = useChat({
    id: activeConvId,
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { conversationId: activeConvId, language },
    }),
    messages: activeConversation?.messages ?? [],
    onFinish() {
      setTimeout(() => {
        setConversations(loadConversations());
      }, 100);
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Save messages when they change — debounced and only after streaming completes
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (activeConvId && messages.length > 0) {
      const title = generateTitle(messages);
      persistConversation(activeConvId, title, messages);

      // If this is a brand-new conversation (not yet in the sidebar), add it now
      setConversations((prev) => {
        if (prev.some((c) => c.id === activeConvId)) {
          // Already in list — just update title/messages in state
          return prev.map((c) =>
            c.id === activeConvId ? { ...c, title, messages, updatedAt: Date.now() } : c,
          );
        }
        const newConv: StoredConversation = {
          id: activeConvId,
          title,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages,
        };
        // Create on server
        fetch('/api/ai/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        }).catch(() => {});
        return [newConv, ...prev];
      });

      // Debounce the server PUT to avoid spamming during streaming
      clearTimeout(saveTimerRef.current);
      if (!isLoading) {
        saveTimerRef.current = setTimeout(() => {
          fetch(`/api/ai/conversations/${activeConvId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              messages: messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: getMessageText(m),
                createdAt: Date.now(),
              })),
            }),
          }).catch(() => {});
        }, 500);
      }
    }
    return () => clearTimeout(saveTimerRef.current);
  }, [messages, activeConvId, isLoading]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleNewChat() {
    const id = crypto.randomUUID();
    setActiveConvId(id);
    setMessages([]);
    // Don't add to the conversations list yet — the conversation
    // will appear in the sidebar once the user sends the first message.
  }

  function handleSelectConversation(id: string) {
    setActiveConvId(id);
    const conv = conversations.find((c) => c.id === id);
    setMessages(conv?.messages ?? []);
  }

  function handleDeleteConversation(id: string) {
    deleteStoredConversation(id);
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    persistConversations(updated);
    if (activeConvId === id) {
      if (updated.length > 0) {
        setActiveConvId(updated[0].id);
        setMessages(updated[0].messages);
      } else {
        // No conversations left — reset to a fresh empty state
        const freshId = crypto.randomUUID();
        setActiveConvId(freshId);
        setMessages([]);
      }
    }
    fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  const handleAccept = useCallback(() => {
    sendMessage({ text: '[ACTION:ACCEPT_PROPOSAL]' });
  }, [sendMessage]);

  const handleReject = useCallback(() => {
    sendMessage({ text: '[ACTION:REJECT_PROPOSAL]' });
  }, [sendMessage]);

  const handleNegotiate = useCallback(() => {
    sendMessage({ text: '[ACTION:NEGOTIATE]' });
  }, [sendMessage]);

  const handleFormSubmit = useCallback((formData: EventFormData) => {
    const parts: string[] = [];
    parts.push(`I'd like to book a ${formData.eventType}`);
    if (formData.venue) parts.push(`at the ${formData.venue}`);
    parts.push(`on ${formData.date}`);
    if (formData.time) parts.push(`(${formData.time})`);
    parts.push(`for ${formData.guests} guests`);
    if (formData.setupType) parts.push(`with ${formData.setupType} setup`);
    if (formData.budget) parts.push(`and a budget of €${formData.budget}`);

    const extras: string[] = [];
    if (formData.catering) extras.push('catering/food service');
    if (formData.av) extras.push('AV equipment (projector, sound system)');
    if (formData.accommodation) extras.push('overnight accommodation for guests');
    if (formData.decoration) extras.push('venue decoration');
    if (extras.length > 0) parts.push(`. I'll also need ${extras.join(', ')}`);

    if (formData.name) parts.push(`. My name is ${formData.name}`);
    if (formData.email) parts.push(`and my email is ${formData.email}`);
    if (formData.notes) parts.push(`. Additional notes: ${formData.notes}`);

    const message = parts.join(' ') + '.';
    sendMessage({ text: message });
    setChatMode('conversation');
  }, [sendMessage]);

  // ─── Voice Mode ───
  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'en' ? 'en-US' : language;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, language]);

  const hasVoiceSupport = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Conversation Sidebar */}
      <aside
        className={cn(
          'flex w-72 flex-col border-r border-gray-200/80 bg-gradient-to-b from-white to-gray-50/50 transition-all duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full absolute lg:relative',
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-sm font-semibold text-gray-800">Conversations</span>
          <button
            onClick={handleNewChat}
            className="group flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition-all duration-200 hover:bg-gray-200 hover:scale-105 active:scale-95"
            title="New chat"
          >
            <svg className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>
              <p className="text-xs font-medium text-gray-500">No conversations yet</p>
              <p className="mt-1 text-[0.65rem] text-gray-400">Start typing to begin</p>
            </div>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                'chat-conv-item group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 mb-0.5 transition-all duration-200',
                activeConvId === conv.id
                  ? 'bg-gray-100 shadow-sm'
                  : 'hover:bg-gray-100/70',
              )}
              onClick={() => handleSelectConversation(conv.id)}
            >
              <div className={cn(
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
                activeConvId === conv.id ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-400',
              )}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  'truncate text-sm font-medium',
                  activeConvId === conv.id ? 'text-gray-900' : 'text-gray-700',
                )}>{conv.title}</p>
                <p className="text-[0.65rem] text-gray-400">
                  {formatRelativeTime(conv.updatedAt)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteConversation(conv.id);
                }}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg opacity-0 transition-all duration-200 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 text-gray-400"
                title="Delete conversation"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col bg-gray-50/30">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-200/80 bg-white/80 backdrop-blur-sm px-6 py-3.5">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 shadow-sm">
            <svg className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">{isSales ? 'AI Sales Assistant' : 'Hotel Concierge'}</h2>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              <p className="text-xs text-gray-500">{isSales ? 'Create proposals, negotiate, analyze pipeline' : 'Book events, check prices, explore facilities'}</p>
            </div>
          </div>
          {/* Mode toggle — guest only */}
          {!isSales && (
            <div className="ml-auto flex items-center gap-2">
              {/* Language Picker */}
              <div className="relative">
                <button
                  onClick={() => setShowLangPicker(!showLangPicker)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-100"
                >
                  <span>{LANGUAGES.find((l) => l.code === language)?.flag}</span>
                  <span className="hidden sm:inline">{LANGUAGES.find((l) => l.code === language)?.label}</span>
                  <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {showLangPicker && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => { setLanguage(l.code); setShowLangPicker(false); }}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                          language === l.code ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50',
                        )}
                      >
                        <span>{l.flag}</span>
                        <span>{l.label}</span>
                        {language === l.code && (
                          <svg className="ml-auto h-4 w-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 p-0.5">
              <button
                onClick={() => setChatMode('conversation')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  chatMode === 'conversation'
                    ? 'bg-white text-gray-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                Chat
              </button>
              <button
                onClick={() => setChatMode('form')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  chatMode === 'form'
                    ? 'bg-white text-gray-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
                Form
              </button>
              </div>
            </div>
          )}
          {/* Language picker for sales */}
          {isSales && (
            <div className="relative ml-auto">
              <button
                onClick={() => setShowLangPicker(!showLangPicker)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-100"
              >
                <span>{LANGUAGES.find((l) => l.code === language)?.flag}</span>
                <span className="hidden sm:inline">{LANGUAGES.find((l) => l.code === language)?.label}</span>
                <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {showLangPicker && (
                <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => { setLanguage(l.code); setShowLangPicker(false); }}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                        language === l.code ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50',
                      )}
                    >
                      <span>{l.flag}</span>
                      <span>{l.label}</span>
                      {language === l.code && (
                        <svg className="ml-auto h-4 w-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Messages or Form */}
        {chatMode === 'form' && !isSales ? (
          <EventBookingForm onSubmit={handleFormSubmit} isLoading={isLoading} />
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 space-y-5">
              {messages.length === 0 && (
                <EmptyState suggestions={suggestions} onSelect={setInput} isSales={isSales} />
              )}

              {messages.map((message, idx) => (
                <div key={message.id} className="chat-msg-enter" style={{ animationDelay: `${Math.min(idx * 30, 200)}ms` }}>
                  <ChatMessage
                    message={message}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    onNegotiate={handleNegotiate}
                    onSendStructuredInput={(textPayload) => sendMessage({ text: textPayload })}
                    isLoading={isLoading}
                  />
                </div>
              ))}

              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <TypingIndicator />
              )}
            </div>

            {/* Input */}
            <div className="border-t border-gray-200/80 bg-white px-4 py-3 sm:px-6 sm:py-4">
              <form
                onSubmit={(e) => { e.preventDefault(); if (input.trim()) { sendMessage({ text: input }); setInput(''); } }}
                className="chat-input-wrapper group relative flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50/50 px-4 transition-all duration-300 focus-within:border-gray-400 focus-within:bg-white focus-within:shadow-lg focus-within:shadow-gray-900/5"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isSales ? 'Ask anything — create proposals, visualize data, analyze pipeline...' : 'Ask about rooms, facilities, prices, or book an event...'}
                  className="flex-1 h-12 bg-transparent text-sm placeholder:text-gray-400 focus:outline-none"
                  disabled={isLoading}
                />
                {/* Voice button */}
                {hasVoiceSupport && (
                  <button
                    type="button"
                    onClick={toggleVoice}
                    className={cn(
                      'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-all duration-200',
                      isListening
                        ? 'bg-red-100 text-red-600 animate-pulse'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
                    )}
                    title={isListening ? 'Stop listening' : 'Voice input'}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    </svg>
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm transition-all duration-200 hover:bg-gray-800 hover:shadow-md hover:shadow-gray-900/25 disabled:opacity-30 disabled:hover:bg-gray-900 disabled:hover:shadow-sm active:scale-95"
                >
                  {isLoading ? (
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  )}
                </button>
              </form>
              <p className="mt-2 text-center text-[0.65rem] text-gray-400">
                AI can make mistakes. Review proposals before sending.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Types for Form Mode ───

interface EventFormData {
  eventType: string;
  venue: string;
  date: string;
  time: string;
  guests: string;
  setupType: string;
  budget: string;
  catering: boolean;
  av: boolean;
  accommodation: boolean;
  decoration: boolean;
  name: string;
  email: string;
  notes: string;
}

const EVENT_TYPES = [
  { value: 'conference', label: 'Conference', icon: '🎤' },
  { value: 'wedding', label: 'Wedding', icon: '💍' },
  { value: 'meeting', label: 'Business Meeting', icon: '🤝' },
  { value: 'dinner', label: 'Dinner / Gala', icon: '🍽️' },
  { value: 'party', label: 'Party / Celebration', icon: '🎉' },
  { value: 'workshop', label: 'Workshop / Training', icon: '📋' },
];

const VENUE_OPTIONS = [
  { value: 'room', label: 'Hotel Room / Suite', icon: '🏨', desc: 'Luxury stay with amenities' },
  { value: 'boardroom', label: 'Boardroom', icon: '💼', desc: '10-20 pax, intimate setting' },
  { value: 'conference', label: 'Conference Room', icon: '🖥️', desc: '30-50 pax, full AV setup' },
  { value: 'banquet', label: 'Banquet Hall', icon: '🎊', desc: '100-500 pax, elegant décor' },
  { value: 'garden', label: 'Garden / Outdoor', icon: '🌿', desc: 'Open air, scenic views' },
  { value: 'restaurant', label: 'Restaurant / Dining', icon: '🍷', desc: 'Fine dining & catering' },
];

const TIME_OPTIONS = [
  { value: 'morning', label: 'Morning (8AM - 12PM)' },
  { value: 'afternoon', label: 'Afternoon (12PM - 5PM)' },
  { value: 'evening', label: 'Evening (5PM - 10PM)' },
  { value: 'full-day', label: 'Full Day' },
];

const SETUP_OPTIONS = [
  { value: 'theater', label: 'Theater' },
  { value: 'classroom', label: 'Classroom' },
  { value: 'banquet', label: 'Banquet' },
  { value: 'cocktail', label: 'Cocktail' },
  { value: 'boardroom', label: 'Boardroom' },
  { value: 'u-shape', label: 'U-Shape' },
];

// ─── Types for form APIs ───
interface ContentItem {
  id: number;
  variation_id: number;
  title: string;
  description?: string;
  unit_value_with_tax?: number;
  product_id?: number;
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
  time_slot_id: string;
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

function EventBookingForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (data: EventFormData) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState<EventFormData>({
    eventType: '',
    venue: '',
    date: '',
    time: '',
    guests: '',
    setupType: '',
    budget: '',
    catering: false,
    av: false,
    accommodation: false,
    decoration: false,
    name: '',
    email: '',
    notes: '',
  });

  // ─── Content Catalog State ───
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [contentLoading, setContentLoading] = useState(true);

  // ─── Calendar State ───
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [calendarHolds, setCalendarHolds] = useState<CalendarHold[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [calendarSummary, setCalendarSummary] = useState<{ available: number; limited: number; booked: number; active_holds: number } | null>(null);

  // ─── Live Availability State ───
  const [availability, setAvailability] = useState<AvailabilityResult[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // Fetch content catalog on mount
  useEffect(() => {
    setContentLoading(true);
    fetch('/api/proposales/content')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const items = data?.data || [];
        setContentItems(items.slice(0, 20));
      })
      .catch(() => {})
      .finally(() => setContentLoading(false));
  }, []);

  // Fetch calendar when month/year changes or when guests change
  useEffect(() => {
    setCalendarLoading(true);
    const params = new URLSearchParams({
      year: String(calendarMonth.year),
      month: String(calendarMonth.month),
    });
    if (form.guests) params.set('guests', form.guests);
    fetch(`/api/mock-pms/calendar?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setCalendarDays(data.days || []);
          setCalendarHolds(data.holds || []);
          setCalendarSummary(data.summary || null);
        }
      })
      .catch(() => {})
      .finally(() => setCalendarLoading(false));
  }, [calendarMonth.year, calendarMonth.month, form.guests]);

  // Fetch live availability when date + guests are set
  useEffect(() => {
    if (!form.date || !form.guests) {
      setAvailability([]);
      return;
    }
    setAvailabilityLoading(true);
    const params = new URLSearchParams({ date: form.date, guests: form.guests });
    if (form.eventType) params.set('event_type', form.eventType);
    if (form.time) params.set('time_slot', form.time);
    fetch(`/api/mock-pms/availability?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setAvailability(data?.results || []);
      })
      .catch(() => {})
      .finally(() => setAvailabilityLoading(false));
  }, [form.date, form.guests, form.eventType, form.time]);

  // Click a calendar day to set the form date
  const handleCalendarDayClick = (day: CalendarDay) => {
    if (day.status === 'booked') return;
    update('date', day.date);
    // Also sync calendarMonth if clicking navigated to a different view
  };

  const prevMonth = () => {
    setCalendarMonth((prev) => {
      if (prev.month === 1) return { year: prev.year - 1, month: 12 };
      return { ...prev, month: prev.month - 1 };
    });
  };
  const nextMonth = () => {
    setCalendarMonth((prev) => {
      if (prev.month === 12) return { year: prev.year + 1, month: 1 };
      return { ...prev, month: prev.month + 1 };
    });
  };

  const update = (field: keyof EventFormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const isValid = form.eventType && form.date && form.guests;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-6 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 mb-3">
            <svg className="h-7 w-7 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Quick Event Booking</h3>
          <p className="text-sm text-gray-500 mt-1">Fill in the details below to generate an accurate proposal</p>
        </div>

        {/* Event Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Event Type *</label>
          <div className="grid grid-cols-3 gap-2">
            {EVENT_TYPES.map((et) => (
              <button
                key={et.value}
                type="button"
                onClick={() => update('eventType', et.value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-sm transition-all',
                  form.eventType === et.value
                    ? 'border-gray-900 bg-gray-100 text-gray-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                <span className="text-xl">{et.icon}</span>
                <span className="font-medium text-xs">{et.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Venue */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Venue</label>
          <div className="grid grid-cols-2 gap-2">
            {VENUE_OPTIONS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => update('venue', v.value)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border-2 px-3 py-3 text-left transition-all',
                  form.venue === v.value
                    ? 'border-gray-900 bg-gray-100'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                <span className="text-2xl pt-0.5">{v.icon}</span>
                <div>
                  <p className={cn('text-sm font-medium', form.venue === v.value ? 'text-gray-900' : 'text-gray-700')}>{v.label}</p>
                  <p className="text-xs text-gray-500">{v.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ─── Content Catalog (from Proposales Content API) ─── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">📦 Available Packages & Services</label>
          {contentLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" />
              <span className="ml-2 text-sm text-gray-500">Loading catalog...</span>
            </div>
          ) : contentItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-500">
              No catalog items available. The AI will use available content when generating your proposal.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {contentItems.map((item) => (
                <div
                  key={item.variation_id || item.id}
                  className="rounded-xl border border-gray-200 bg-white p-3 hover:border-gray-300 hover:bg-gray-50 transition-all"
                >
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-medium text-gray-800 line-clamp-1">{item.title}</p>
                    {item.unit_value_with_tax != null && item.unit_value_with_tax > 0 && (
                      <span className="text-xs font-semibold text-gray-700 whitespace-nowrap ml-2">
                        €{(item.unit_value_with_tax / 100).toLocaleString('en-IE', { minimumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1.5">These items from the Proposales catalog will be used when generating your proposal with real pricing.</p>
        </div>

        {/* Date, Time, Guests row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => update('date', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Time</label>
            <select
              value={form.time}
              onChange={(e) => update('time', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            >
              <option value="">Select time</option>
              {TIME_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Guests *</label>
            <input
              type="number"
              value={form.guests}
              onChange={(e) => update('guests', e.target.value)}
              placeholder="e.g. 50"
              min="1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>
        </div>

        {/* ─── Availability Calendar (PMS) ─── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">📅 Availability Calendar</label>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Calendar header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-200 transition-colors">
                <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-gray-800">
                {new Date(calendarMonth.year, calendarMonth.month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-gray-200 transition-colors">
                <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>

            {calendarLoading ? (
              <div className="flex items-center justify-center py-8">
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
                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-px bg-gray-100 p-px">
                  {/* Leading empty cells */}
                  {calendarDays.length > 0 && Array.from({ length: calendarDays[0].dow }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-white h-9" />
                  ))}
                  {calendarDays.map((day) => {
                    const isSelected = form.date === day.date;
                    const holdOnDay = calendarHolds.find((h) => h.date === day.date);
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => handleCalendarDayClick(day)}
                        disabled={day.status === 'booked'}
                        title={
                          day.status === 'booked'
                            ? 'Fully booked'
                            : day.status === 'limited'
                              ? `Limited availability (${day.available_count}/${day.total_count} slots)`
                              : holdOnDay
                                ? `Held: ${holdOnDay.space_name}`
                                : `Available (${day.available_count}/${day.total_count} slots)`
                        }
                        className={cn(
                          'relative h-9 text-xs font-medium transition-all flex items-center justify-center',
                          isSelected
                            ? 'bg-gray-900 text-white ring-2 ring-gray-300'
                            : day.status === 'available'
                              ? 'bg-white text-gray-800 hover:bg-green-50'
                              : day.status === 'limited'
                                ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                                : 'bg-red-50 text-red-300 cursor-not-allowed',
                        )}
                      >
                        {day.day}
                        {/* Status dot */}
                        <span className={cn(
                          'absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full',
                          isSelected ? 'bg-white' :
                          day.status === 'available' ? 'bg-green-400' :
                          day.status === 'limited' ? 'bg-amber-400' : 'bg-red-400',
                        )} />
                        {holdOnDay && !isSelected && (
                          <span className="absolute top-0 right-0.5 text-[8px]">🔒</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Calendar legend + summary */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-[10px]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400" />Available</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />Limited</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />Booked</span>
                <span className="flex items-center gap-1">🔒 Held</span>
              </div>
              {calendarSummary && (
                <span className="text-gray-500">
                  {calendarSummary.available}✓ {calendarSummary.limited}⚠ {calendarSummary.booked}✕
                  {calendarSummary.active_holds > 0 && ` ${calendarSummary.active_holds}🔒`}
                </span>
              )}
            </div>
          </div>
          {form.guests && (
            <p className="text-xs text-gray-400 mt-1">Showing availability for {form.guests}+ guests. Click a date to select it.</p>
          )}
        </div>

        {/* ─── Live Availability for Selected Date ─── */}
        {form.date && form.guests && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🏨 Available Spaces on {new Date(form.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </label>
            {availabilityLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" />
                <span className="ml-2 text-xs text-gray-500">Checking availability...</span>
              </div>
            ) : availability.length === 0 ? (
              <div className="rounded-xl border border-dashed border-red-200 bg-red-50 p-4 text-center">
                <p className="text-sm font-medium text-red-700">No spaces available</p>
                <p className="text-xs text-red-500 mt-1">All suitable spaces are booked or held for this date. Try a different date or adjust guest count.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {availability.map((slot, i) => (
                  <button
                    key={`${slot.space_id}-${slot.time_slot_id}-${i}`}
                    type="button"
                    onClick={() => {
                      update('venue', slot.space_type === 'banquet' ? 'banquet' : slot.space_type === 'boardroom' ? 'boardroom' : slot.space_type === 'conference' ? 'conference' : slot.space_type === 'outdoor' ? 'garden' : slot.space_type === 'restaurant' ? 'restaurant' : 'room');
                      update('time', slot.time_slot_id);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between rounded-xl border-2 p-3 text-left transition-all',
                      form.venue && form.time === slot.time_slot_id && form.venue === (slot.space_type === 'banquet' ? 'banquet' : slot.space_type === 'boardroom' ? 'boardroom' : slot.space_type)
                        ? 'border-gray-900 bg-gray-100'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{slot.space_name}</p>
                      <p className="text-xs text-gray-500">{slot.time_slot} · {slot.capacity} max · {slot.amenities.slice(0, 2).join(', ')}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-sm font-bold text-gray-700">{slot.price}</p>
                      <p className="text-[10px] text-green-600 font-medium">✓ Available</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Setup & Budget row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Setup Style</label>
            <select
              value={form.setupType}
              onChange={(e) => update('setupType', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            >
              <option value="">Select setup</option>
              {SETUP_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Budget (EUR)</label>
            <input
              type="number"
              value={form.budget}
              onChange={(e) => update('budget', e.target.value)}
              placeholder="e.g. 5000"
              min="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>
        </div>

        {/* Add-ons */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Add-ons</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'catering' as const, label: 'Catering & Food', icon: '🍽️' },
              { key: 'av' as const, label: 'AV Equipment', icon: '🎙️' },
              { key: 'accommodation' as const, label: 'Guest Accommodation', icon: '🛏️' },
              { key: 'decoration' as const, label: 'Decoration & Setup', icon: '🎨' },
            ]).map((addon) => (
              <button
                key={addon.key}
                type="button"
                onClick={() => update(addon.key, !form[addon.key])}
                className={cn(
                  'flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm transition-all',
                  form[addon.key]
                    ? 'border-gray-900 bg-gray-100 text-gray-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                )}
              >
                <span>{addon.icon}</span>
                <span className="font-medium">{addon.label}</span>
                {form[addon.key] && (
                  <svg className="ml-auto h-4 w-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Contact details */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="John Doe"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="john@example.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Additional Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={2}
            placeholder="Any special requirements or preferences..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-700 resize-none"
          />
        </div>

        {/* Submit */}
        <button
          onClick={() => isValid && onSubmit(form)}
          disabled={!isValid || isLoading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          Generate Proposal with AI
        </button>

        <p className="text-center text-xs text-gray-400 pb-4">
          Fields marked with * are required. The AI will fill in pricing and create a detailed proposal.
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function EmptyState({
  suggestions,
  onSelect,
  isSales,
}: {
  suggestions: string[];
  onSelect: (s: string) => void;
  isSales: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      {/* Animated icon */}
      <div className="relative mb-6">
        <div className="absolute -inset-3 rounded-full bg-gray-200/50 blur-xl animate-pulse" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-700 to-gray-900 shadow-lg shadow-gray-900/20">
          <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-1">How can I help?</h3>
      <p className="text-sm text-gray-500 max-w-md mb-8">
        {isSales
          ? 'I can create proposals, negotiate pricing, visualize your data with charts, and manage the full proposal lifecycle.'
          : 'I can help you explore our hotel facilities, check room and event prices, book venues, and manage your event proposals.'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl w-full">
        {suggestions.map((s, i) => (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className="chat-suggestion text-left rounded-xl border border-gray-200/80 bg-white p-3.5 text-sm text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 hover:shadow-md hover:shadow-gray-900/5 hover:-translate-y-0.5 active:translate-y-0"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="line-clamp-2">{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InputCard({
  request,
  disabled,
  onSubmit,
}: {
  request: UserInputRequest;
  disabled: boolean;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const initialValues = useMemo(() => {
    const values: Record<string, string> = {};
    for (const field of request.fields) {
      if (field.default_value) {
        values[field.name] = field.default_value;
      } else if (field.type === 'toggle_group' && field.options?.[0]?.value) {
        values[field.name] = field.options[0].value;
      } else {
        values[field.name] = '';
      }
    }
    return values;
  }, [request.fields]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const missingRequired = request.fields.some((field) => field.required && !values[field.name]?.trim());

  return (
    <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-gray-900 px-4 py-3">
        <h4 className="text-sm font-semibold text-white">{request.title}</h4>
        {request.description && <p className="text-xs text-gray-200 mt-0.5">{request.description}</p>}
      </div>
      <div className="p-4 space-y-3">
        {request.fields.map((field) => (
          <div key={field.name} className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-700">
              {field.label}{field.required ? ' *' : ''}
            </label>

            {field.type === 'select' && (
              <select
                value={values[field.name] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                disabled={disabled}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-60"
              >
                <option value="">{field.placeholder || `Select ${field.label.toLowerCase()}`}</option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}

            {field.type === 'date' && (
              <input
                type="date"
                value={values[field.name] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                disabled={disabled}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-60"
              />
            )}

            {field.type === 'number' && (
              <input
                type="number"
                value={values[field.name] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                min={field.min}
                max={field.max}
                placeholder={field.placeholder}
                disabled={disabled}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-60"
              />
            )}

            {field.type === 'text' && (
              <input
                type="text"
                value={values[field.name] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                placeholder={field.placeholder}
                disabled={disabled}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-60"
              />
            )}

            {field.type === 'toggle_group' && (
              <div className="grid grid-cols-2 gap-2">
                {(field.options ?? []).map((option) => {
                  const active = values[field.name] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setValues((prev) => ({ ...prev, [field.name]: option.value }))}
                      disabled={disabled}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                        active
                          ? 'border-gray-900 bg-gray-100 text-gray-900'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                      )}
                    >
                      {option.icon && <span>{option.icon}</span>}
                      <span className="font-medium">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          disabled={disabled || missingRequired}
          onClick={() => onSubmit(values)}
          className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  onAccept,
  onReject,
  onNegotiate,
  onSendStructuredInput,
  isLoading,
}: {
  message: UIMessage;
  onAccept: () => void;
  onReject: () => void;
  onNegotiate: () => void;
  onSendStructuredInput: (textPayload: string) => void;
  isLoading: boolean;
}) {
  const text = getMessageText(message);

  // Extract tool parts — handle both flat DynamicToolUIPart and nested ToolInvocation formats
  const toolParts: ToolPart[] = [];
  for (const p of message.parts) {
    if (p.type === 'dynamic-tool') {
      // Flat structure: { type, toolName, toolCallId, state, output }
      toolParts.push(p as unknown as ToolPart);
    } else if (p.type.startsWith('tool-')) {
      // Named tool: { type: 'tool-<name>', toolCallId, state, output }
      toolParts.push(p as unknown as ToolPart);
    } else if (p.type === 'tool-invocation' && 'toolInvocation' in p) {
      // Nested structure: { type: 'tool-invocation', toolInvocation: { toolName, toolCallId, state, result } }
      const inv = (p as any).toolInvocation;
      toolParts.push({
        type: p.type,
        toolName: inv.toolName ?? '',
        toolCallId: inv.toolCallId ?? '',
        state: inv.state === 'result' ? 'output-available' : inv.state,
        input: inv.args,
        output: inv.result,
      });
    }
  }

  // Hide action messages — show a pill label instead
  if (message.role === 'user' && text.startsWith('[ACTION:')) {
    const label =
      text === '[ACTION:ACCEPT_PROPOSAL]'
        ? 'Accepted the proposal'
        : text === '[ACTION:REJECT_PROPOSAL]'
          ? 'Rejected the proposal'
          : 'Requested negotiation';
    return (
      <div className="flex justify-end">
        <div className="rounded-full bg-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
          {label}
        </div>
      </div>
    );
  }

  // Extract proposal drafts, charts, booking confirmations, and rich tool results
  const proposalDrafts: ProposalDraft[] = [];
  const charts: ChartConfig[] = [];
  const bookingConfirmations: { url: string; title: string; emailSent?: boolean }[] = [];
  const availabilityResults: AvailabilityResult[] = [];
  const searchResults: SearchResultSet[] = [];
  const pricingResults: PricingResult[] = [];
  const calendarResults: CalendarResult[] = [];
  const floorPlanResults: FloorPlanResult[] = [];
  const inputRequests: UserInputRequest[] = [];
  for (const part of toolParts) {
    if (part.state === 'output-available' && part.output && typeof part.output === 'object') {
      const result = part.output as Record<string, unknown>;
      if (result.type === 'proposal_draft') {
        proposalDrafts.push(result as unknown as ProposalDraft);
      } else if (result.type === 'chart') {
        charts.push(result as unknown as ChartConfig);
      } else if (result.type === 'booking_confirmed' && result.esign && typeof result.esign === 'object') {
        const esign = result.esign as { url?: string };
        const booking = result.booking as { title?: string } | undefined;
        if (esign.url) {
          bookingConfirmations.push({ url: esign.url, title: booking?.title || 'Your Proposal', emailSent: !!result.emailSent });
        }
      } else if (result.type === 'availability' && Array.isArray(result.options)) {
        availabilityResults.push(result as unknown as AvailabilityResult);
      } else if (result.type === 'pricing_calculation' || result.type === 'pricing') {
        pricingResults.push(result as unknown as PricingResult);
      } else if (result.type === 'availability_calendar') {
        calendarResults.push(result as unknown as CalendarResult);
      } else if (result.type === 'floor_plan') {
        floorPlanResults.push(result as unknown as FloorPlanResult);
      } else if (result.type === 'user_input_request' && Array.isArray(result.fields)) {
        inputRequests.push(result as unknown as UserInputRequest);
      }
      // Search results from searchProposals tool
      if (part.toolName === 'searchProposals' && Array.isArray(result.results)) {
        searchResults.push({ type: 'proposals', items: result.results as SearchItem[], total: (result.total as number) || 0 });
      }
    }
  }

  return (
    <div
      className={cn(
        'flex gap-3',
        message.role === 'user' ? 'justify-end' : 'justify-start',
      )}
    >
      {message.role === 'assistant' && (
        <div className="flex-shrink-0 mt-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900 shadow-sm">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
        </div>
      )}

      <div className={cn('max-w-[80%] space-y-3')}>
        {/* Proposal Draft Cards */}
        {proposalDrafts.map((draft, i) => (
          <ProposalCard
            key={i}
            draft={draft}
            onAccept={onAccept}
            onReject={onReject}
            onNegotiate={onNegotiate}
            isLoading={isLoading}
          />
        ))}

        {/* Proposal Comparison — shown when multiple rounds in conversation */}
        {proposalDrafts.length >= 2 && (
          <ProposalComparisonCard drafts={proposalDrafts} />
        )}

        {/* Chart Cards */}
        {charts.map((chart, i) => (
          <ChartCard key={`chart-${i}`} config={chart} />
        ))}

        {/* Availability / Venue Cards */}
        {availabilityResults.map((avail, i) => (
          <AvailabilityCard key={`avail-${i}`} data={avail} />
        ))}

        {/* Pricing Result Cards */}
        {pricingResults.map((pricing, i) => (
          <PricingCard key={`pricing-${i}`} data={pricing} />
        ))}

        {/* Search Result Cards */}
        {searchResults.map((sr, i) => (
          <SearchResultsCard key={`search-${i}`} data={sr} />
        ))}

        {/* Availability Calendar Cards */}
        {calendarResults.map((cal, i) => (
          <AvailabilityCalendarCard key={`cal-${i}`} data={cal} />
        ))}

        {/* Floor Plan Cards */}
        {floorPlanResults.map((fp, i) => (
          <FloorPlanCard key={`fp-${i}`} data={fp} />
        ))}

        {/* Structured Input Cards */}
        {inputRequests.map((request, i) => (
          <InputCard
            key={`input-request-${i}`}
            request={request}
            disabled={isLoading}
            onSubmit={(values) => {
              const pairs = request.fields
                .map((field) => {
                  const value = values[field.name];
                  return value ? `${field.label}: ${value}` : null;
                })
                .filter((pair): pair is string => !!pair);

              if (pairs.length === 0) return;

              const payload = `Here are the requested details:\n${pairs.map((p) => `- ${p}`).join('\n')}`;
              onSendStructuredInput(payload);
            }}
          />
        ))}

        {/* E-Sign Cards with QR Code */}
        {bookingConfirmations.map((conf, i) => (
          <div key={`esign-${i}`} className="w-full max-w-lg rounded-xl border border-green-200 bg-green-50 shadow-sm overflow-hidden venue-card-enter">
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-green-800">Proposal Created</h4>
                <p className="text-xs text-green-600 mt-0.5">{conf.title}</p>
              </div>
            </div>
            {conf.emailSent && (
              <div className="px-5 pb-2 flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                <span className="text-xs font-medium text-green-700">E-sign link sent to your email</span>
              </div>
            )}
            {/* QR Code */}
            <div className="px-5 py-3 flex items-center gap-4 border-t border-green-100">
              <div className="rounded-lg bg-white p-2 shadow-sm">
                <QRCodeSVG value={conf.url} size={80} level="M" />
              </div>
              <div>
                <p className="text-xs font-semibold text-green-800">Scan to E-Sign</p>
                <p className="text-[0.65rem] text-green-600 mt-0.5">Open on your phone to review and sign the proposal instantly</p>
              </div>
            </div>
            <div className="border-t border-green-200 px-5 py-3">
              <a
                href={conf.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                View &amp; E-Sign Proposal
              </a>
            </div>
          </div>
        ))}

        {/* Text content */}
        {text && (
          <div
            className={cn(
              'rounded-2xl px-4 py-3 text-sm',
              message.role === 'user'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-white border border-gray-200/80 text-gray-800 shadow-sm',
            )}
          >
            {message.role === 'assistant' ? (
              <div
                className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-gray-700 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(text) }}
              />
            ) : (
              <p className="whitespace-pre-wrap">{text}</p>
            )}
          </div>
        )}

        {/* Tool invocation indicators — show clean thinking/generating state */}
        {(() => {
          const pendingTools = toolParts.filter(
            (t) => !(t.state === 'output-available' &&
                t.output &&
                typeof t.output === 'object' &&
                (((t.output as Record<string, unknown>).type === 'proposal_draft') ||
                 ((t.output as Record<string, unknown>).type === 'chart') ||
                 ((t.output as Record<string, unknown>).type === 'booking_confirmed'))),
          );
          if (pendingTools.length === 0) return null;

          const hasRunning = pendingTools.some((t) => t.state !== 'output-available');
          const allDone = pendingTools.every((t) => t.state === 'output-available');

          if (allDone) return null; // hide once all tools are done and text is streamed

          // Determine a user-friendly label based on running tools
          const runningTool = pendingTools.find((t) => t.state !== 'output-available');
          const label = runningTool
            ? getThinkingLabel(runningTool.toolName)
            : 'Generating response...';

          return (
            <div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          );
        })()}
      </div>

      {message.role === 'user' && (
        <div className="flex-shrink-0 mt-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-200 shadow-sm">
            <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  draft,
  onAccept,
  onReject,
  onNegotiate,
  isLoading,
}: {
  draft: ProposalDraft;
  onAccept: () => void;
  onReject: () => void;
  onNegotiate: () => void;
  isLoading: boolean;
}) {
  const [actionTaken, setActionTaken] = useState<'accepted' | 'rejected' | null>(null);
  const buttonsDisabled = actionTaken !== null || isLoading;

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: draft.currency || 'EUR',
    }).format(n);

  const venueImage = getVenueImage(draft.venue_type);

  return (
    <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Venue Image */}
      {venueImage && (
        <div className="relative h-36 w-full overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${venueImage.url})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="absolute bottom-3 left-4 flex items-center gap-2">
            <span className="rounded-full bg-white/20 backdrop-blur-sm px-2.5 py-0.5 text-xs font-medium text-white">
              {venueImage.label}
            </span>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-gray-900 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <h3 className="text-base font-semibold text-white">Proposal Draft</h3>
            </div>
            <p className="mt-1 text-sm text-white/80">{draft.title}</p>
          </div>
          {draft.discount_applied > 0 && (
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
              {draft.discount_applied}% OFF
            </span>
          )}
        </div>
        {draft.is_final_offer && (
          <div className="mt-2 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90">
            This is our best and final offer
          </div>
        )}
      </div>

      {/* Recipient */}
      <div className="border-b border-gray-100 px-5 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Recipient</p>
        <p className="text-sm font-medium text-gray-800">{draft.recipient.name}</p>
        <p className="text-xs text-gray-500">{draft.recipient.email}</p>
        {draft.recipient.company && (
          <p className="text-xs text-gray-500">{draft.recipient.company}</p>
        )}
      </div>

      {/* Line Items with slide-in animation */}
      <div className="px-5 py-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Item</th>
              <th className="pb-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400">Qty</th>
              <th className="pb-2 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Price</th>
              <th className="pb-2 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Total</th>
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item, i) => (
              <tr key={i} className="border-b border-gray-50 cost-line-item" style={{ animationDelay: `${i * 120}ms` }}>
                <td className="py-2.5">
                  <p className="font-medium text-gray-800">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.description}</p>
                </td>
                <td className="py-2.5 text-center text-gray-600">{item.quantity}</td>
                <td className="py-2.5 text-right text-gray-600">{fmt(item.unit_price)}</td>
                <td className="py-2.5 text-right font-medium text-gray-800">{fmt(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals with count-up animation */}
      <div className="border-t border-gray-200 bg-gray-50 px-5 py-3 space-y-1 cost-total-reveal" style={{ animationDelay: `${draft.items.length * 120 + 200}ms` }}>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>{fmt(draft.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Tax (est.)</span>
          <span>{fmt(draft.tax)}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-200">
          <span>Total</span>
          <span>{fmt(draft.total)}</span>
        </div>
        {draft.negotiation_round > 0 && (
          <p className="text-xs text-green-600 font-medium">
            Round {draft.negotiation_round} of {draft.max_negotiation_rounds} — {draft.discount_applied}% discount applied
          </p>
        )}
      </div>

      {/* Notes */}
      {draft.notes && (
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="text-xs text-gray-500">{draft.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-gray-200 px-5 py-4 flex gap-3">
        {actionTaken === 'accepted' ? (
          <div className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-100 px-4 py-2.5 text-sm font-semibold text-green-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Accepted
          </div>
        ) : actionTaken === 'rejected' ? (
          <div className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-100 px-4 py-2.5 text-sm font-semibold text-red-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            {draft.negotiation_round < draft.max_negotiation_rounds ? 'Rejected' : 'Declined'}
          </div>
        ) : (
          <>
            <button
              onClick={() => { setActionTaken('accepted'); onAccept(); }}
              disabled={buttonsDisabled}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Accept
            </button>
            {draft.negotiation_round < draft.max_negotiation_rounds ? (
              <button
                onClick={() => { setActionTaken('rejected'); onReject(); }}
                disabled={buttonsDisabled}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Reject
              </button>
            ) : (
              <button
                onClick={() => { setActionTaken('rejected'); onReject(); }}
                disabled={buttonsDisabled}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Decline
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 chat-msg-enter">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900 shadow-sm">
        <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>
      <div className="rounded-2xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm">
        <div className="flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Rich Tool Result Cards ───

const SPACE_IMAGES: Record<string, string> = {
  'Grand Ballroom': 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=600&h=300&fit=crop&q=80',
  'Executive Boardroom': 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=300&fit=crop&q=80',
  'Rooftop Garden': 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&h=300&fit=crop&q=80',
  'Conference Hall A': 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&h=300&fit=crop&q=80',
  'The Grand Restaurant': 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=300&fit=crop&q=80',
};

function AvailabilityCard({ data }: { data: AvailabilityResult }) {
  return (
    <div className="w-full max-w-lg venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Available Spaces</h4>
            <p className="text-xs text-gray-500">
              {data.query.date} · {data.query.guests} guests · {data.query.event_type}
            </p>
          </div>
          <span className="ml-auto rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
            {data.options.length} found
          </span>
        </div>
        {/* Options */}
        <div className="p-3 space-y-2">
          {data.options.slice(0, 5).map((opt, i) => {
            const img = SPACE_IMAGES[opt.space_name];
            return (
              <div
                key={i}
                className="venue-card-enter flex gap-3 rounded-lg border border-gray-100 bg-white p-3 hover:border-gray-300 hover:shadow-sm transition-all duration-200"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {img && (
                  <div className="flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden">
                    <img src={img} alt={opt.space_name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{opt.space_name}</p>
                      <p className="text-xs text-gray-500 capitalize">{opt.time_slot} · Up to {opt.capacity} pax</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-sm font-bold text-gray-700">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: opt.currency || 'SEK', maximumFractionDigits: 0 }).format(opt.total_price)}
                      </p>
                      {opt.base_price !== opt.total_price && (
                        <p className="text-[0.65rem] text-gray-400 line-through">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: opt.currency || 'SEK', maximumFractionDigits: 0 }).format(opt.base_price)}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Capacity bar */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-1 rounded-full bg-gray-400 transition-all"
                        style={{ width: `${Math.min(opt.utilization * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[0.6rem] text-gray-400">{Math.round(opt.utilization * 100)}% util</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PricingCard({ data }: { data: PricingResult }) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: data.currency || 'SEK',
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="w-full max-w-md venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden tool-result-shimmer">
        <div className="bg-gray-900 px-5 py-3">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
            <h4 className="text-sm font-semibold text-white">{data.space_name}</h4>
          </div>
        </div>
        <div className="px-5 py-3 space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Base Price</span>
            <span>{fmt(data.base_price)}</span>
          </div>
          {data.breakdown?.map((b, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-gray-500 capitalize">{b.factor.replace(/_/g, ' ')}</span>
              <span className={cn('font-medium', b.multiplier > 1 ? 'text-warning-600' : 'text-success-600')}>
                ×{b.multiplier.toFixed(2)}
              </span>
            </div>
          ))}
          <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Total</span>
            <span className="text-lg font-bold text-gray-900">{fmt(data.total_price)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchResultsCard({ data }: { data: SearchResultSet }) {
  const STATUS_COLORS: Record<string, string> = {
    accepted: 'bg-green-100 text-green-700',
    active: 'bg-gray-100 text-gray-700',
    draft: 'bg-gray-100 text-gray-600',
    expired: 'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-700',
    sent: 'bg-blue-100 text-blue-700',
  };

  if (data.items.length === 0) return null;

  return (
    <div className="w-full max-w-lg venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <h4 className="text-sm font-semibold text-gray-700">Proposals Found</h4>
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            {data.total}
          </span>
        </div>
        <div className="divide-y divide-gray-50">
          {data.items.slice(0, 5).map((item, i) => (
            <div
              key={item.uuid || i}
              className="px-5 py-2.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.title_md || item.title || 'Untitled'}
                </p>
                <p className="text-xs text-gray-400">
                  {item.contact_name || item.recipient_name || 'No contact'}
                </p>
              </div>
              {item.status && (
                <span className={cn('rounded-full px-2 py-0.5 text-[0.65rem] font-medium capitalize', STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-600')}>
                  {item.status}
                </span>
              )}
              {item.value_with_tax != null && (
                <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
                  {new Intl.NumberFormat('en-IE', { style: 'currency', currency: item.currency || 'EUR', maximumFractionDigits: 0 }).format(item.value_with_tax)}
                </span>
              )}
            </div>
          ))}
          {data.items.length > 5 && (
            <div className="px-5 py-2 text-center">
              <span className="text-xs text-gray-400">+{data.items.length - 5} more</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Availability Calendar Card ───

const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function AvailabilityCalendarCard({ data }: { data: CalendarResult }) {
  const firstDow = data.days[0]?.dow ?? 0;
  const blanks = Array.from({ length: firstDow }, (_, i) => i);

  return (
    <div className="w-full max-w-md venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <h4 className="text-sm font-semibold text-white">{data.month_name} {data.year}</h4>
          </div>
          <span className="text-xs text-white/70">{data.space_name}</span>
        </div>

        {/* Legend */}
        <div className="px-5 py-2 flex items-center gap-4 border-b border-gray-100 text-[0.65rem]">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-green-400" /> Available ({data.summary.available})</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Limited ({data.summary.limited})</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-300" /> Booked ({data.summary.booked})</span>
        </div>

        {/* Calendar Grid */}
        <div className="p-4">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW_LABELS.map((d) => (
              <div key={d} className="text-center text-[0.6rem] font-semibold text-gray-400 uppercase">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {blanks.map((b) => (
              <div key={`blank-${b}`} />
            ))}
            {data.days.map((day, i) => {
              const bg = day.status === 'available' ? 'bg-green-100 text-green-800 hover:bg-green-200'
                : day.status === 'limited' ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                : 'bg-red-100 text-red-400';
              return (
                <div
                  key={day.date}
                  className={cn(
                    'cal-day-enter flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors cursor-default',
                    bg,
                  )}
                  style={{ animationDelay: `${i * 15}ms` }}
                  title={`${day.date}: ${day.slots_available}/${day.slots_total} slots available`}
                >
                  {day.day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Floor Plan Card ───

function FloorPlanCard({ data }: { data: FloorPlanResult }) {
  return (
    <div className="w-full max-w-md venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-3">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <h4 className="text-sm font-semibold text-white">Floor Plan — {data.layout.charAt(0).toUpperCase() + data.layout.slice(1)}</h4>
          </div>
          <p className="text-xs text-white/70 mt-0.5">{data.space_name}</p>
        </div>

        {/* SVG Floor Plan */}
        <div className="p-4 flex justify-center">
          <FloorPlanSVG layout={data.layout} guests={data.guests} />
        </div>

        {/* Info */}
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-sm text-gray-700">{data.recommendation}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              data.fits ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
            )}>
              {data.fits ? `Fits ${data.guests} guests` : 'Exceeds capacity'}
            </span>
            <span className="text-xs text-gray-400">Max: {data.max_capacity_for_layout} pax</span>
          </div>
        </div>

        {/* Layout Options */}
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider mb-2">Alternative Layouts</p>
          <div className="flex flex-wrap gap-1.5">
            {data.layouts_available.map((l) => (
              <span
                key={l.layout}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors',
                  l.layout === data.layout ? 'border-gray-900 bg-gray-100 text-gray-900' :
                  l.fits_guests ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-gray-100 bg-gray-50 text-gray-400',
                )}
              >
                {l.layout.charAt(0).toUpperCase() + l.layout.slice(1)} ({l.max_capacity})
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FloorPlanSVG({ layout, guests }: { layout: string; guests: number }) {
  const w = 280;
  const h = 180;

  const renderLayout = () => {
    switch (layout) {
      case 'theater': {
        const rows = Math.min(Math.ceil(guests / 8), 6);
        const seatsPerRow = Math.ceil(guests / rows);
        return (
          <>
            {/* Stage */}
            <rect x={w / 2 - 50} y={10} width={100} height={20} rx={4} fill="#171717" opacity={0.3} />
            <text x={w / 2} y={24} textAnchor="middle" fontSize={8} fill="#171717" fontWeight={600}>STAGE</text>
            {/* Seats */}
            {Array.from({ length: rows }).map((_, row) =>
              Array.from({ length: seatsPerRow }).map((_, col) => {
                const seatNum = row * seatsPerRow + col;
                if (seatNum >= guests) return null;
                const cx = (w - seatsPerRow * 22) / 2 + col * 22 + 11;
                const cy = 50 + row * 22;
                return <circle key={seatNum} cx={cx} cy={cy} r={7} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${seatNum * 20}ms` }} />;
              }),
            )}
          </>
        );
      }
      case 'classroom': {
        const rows = Math.min(Math.ceil(guests / 6), 5);
        const desksPerRow = Math.ceil(guests / rows / 2);
        return (
          <>
            <rect x={w / 2 - 40} y={8} width={80} height={16} rx={3} fill="#171717" opacity={0.3} />
            <text x={w / 2} y={20} textAnchor="middle" fontSize={7} fill="#171717" fontWeight={600}>PRESENTER</text>
            {Array.from({ length: rows }).map((_, row) => (
              <g key={row}>
                {Array.from({ length: desksPerRow }).map((_, col) => {
                  const x = (w - desksPerRow * 55) / 2 + col * 55;
                  const y = 40 + row * 30;
                  return (
                    <g key={col} className="floor-plan-seat" style={{ animationDelay: `${(row * desksPerRow + col) * 30}ms` }}>
                      <rect x={x} y={y} width={45} height={12} rx={2} fill="#e5e5e5" stroke="#171717" strokeWidth={0.5} />
                      <circle cx={x + 15} cy={y + 20} r={5} fill="#171717" opacity={0.6} />
                      <circle cx={x + 30} cy={y + 20} r={5} fill="#171717" opacity={0.6} />
                    </g>
                  );
                })}
              </g>
            ))}
          </>
        );
      }
      case 'banquet': {
        const tables = Math.ceil(guests / 8);
        const cols = Math.min(tables, 3);
        const rows = Math.ceil(tables / cols);
        return (
          <>
            {Array.from({ length: tables }).map((_, i) => {
              const row = Math.floor(i / cols);
              const col = i % cols;
              const cx = (w - cols * 80) / 2 + col * 80 + 40;
              const cy = 30 + row * 70 + 35;
              return (
                <g key={i} className="floor-plan-seat" style={{ animationDelay: `${i * 60}ms` }}>
                  <circle cx={cx} cy={cy} r={22} fill="#e5e5e5" stroke="#171717" strokeWidth={1} />
                  {Array.from({ length: 8 }).map((_, s) => {
                    const angle = (s / 8) * Math.PI * 2 - Math.PI / 2;
                    const sx = cx + Math.cos(angle) * 30;
                    const sy = cy + Math.sin(angle) * 30;
                    return <circle key={s} cx={sx} cy={sy} r={4} fill="#171717" opacity={0.6} />;
                  })}
                </g>
              );
            })}
          </>
        );
      }
      case 'u-shape': {
        const sideSeats = Math.floor(guests / 3);
        const bottomSeats = guests - sideSeats * 2;
        return (
          <>
            {/* U-shape table */}
            <rect x={40} y={30} width={12} height={120} rx={3} fill="#e5e5e5" stroke="#171717" strokeWidth={1} />
            <rect x={w - 52} y={30} width={12} height={120} rx={3} fill="#e5e5e5" stroke="#171717" strokeWidth={1} />
            <rect x={40} y={138} width={w - 80} height={12} rx={3} fill="#e5e5e5" stroke="#171717" strokeWidth={1} />
            {/* Left seats */}
            {Array.from({ length: sideSeats }).map((_, i) => (
              <circle key={`l-${i}`} cx={25} cy={40 + i * (110 / sideSeats)} r={5} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${i * 30}ms` }} />
            ))}
            {/* Right seats */}
            {Array.from({ length: sideSeats }).map((_, i) => (
              <circle key={`r-${i}`} cx={w - 25} cy={40 + i * (110 / sideSeats)} r={5} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${(sideSeats + i) * 30}ms` }} />
            ))}
            {/* Bottom seats */}
            {Array.from({ length: bottomSeats }).map((_, i) => (
              <circle key={`b-${i}`} cx={60 + i * ((w - 120) / Math.max(bottomSeats - 1, 1))} cy={162} r={5} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${(sideSeats * 2 + i) * 30}ms` }} />
            ))}
            <text x={w / 2} y={20} textAnchor="middle" fontSize={7} fill="#171717" fontWeight={600}>OPEN END</text>
          </>
        );
      }
      case 'boardroom': {
        const halfGuests = Math.ceil(guests / 2);
        return (
          <>
            <rect x={w / 2 - 60} y={h / 2 - 20} width={120} height={40} rx={8} fill="#e5e5e5" stroke="#171717" strokeWidth={1} />
            {Array.from({ length: halfGuests }).map((_, i) => (
              <circle key={`t-${i}`} cx={w / 2 - 50 + i * (100 / Math.max(halfGuests - 1, 1))} cy={h / 2 - 30} r={5} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
            {Array.from({ length: guests - halfGuests }).map((_, i) => (
              <circle key={`b-${i}`} cx={w / 2 - 50 + i * (100 / Math.max(guests - halfGuests - 1, 1))} cy={h / 2 + 30} r={5} fill="#171717" opacity={0.6} className="floor-plan-seat" style={{ animationDelay: `${(halfGuests + i) * 40}ms` }} />
            ))}
          </>
        );
      }
      case 'cocktail':
      default: {
        // Scattered standing tables
        const tables = Math.ceil(guests / 4);
        return (
          <>
            {Array.from({ length: tables }).map((_, i) => {
              const angle = (i / tables) * Math.PI * 2;
              const radius = 50 + (i % 2) * 20;
              const cx = w / 2 + Math.cos(angle) * radius;
              const cy = h / 2 + Math.sin(angle) * (radius * 0.6);
              return (
                <g key={i} className="floor-plan-seat" style={{ animationDelay: `${i * 50}ms` }}>
                  <circle cx={cx} cy={cy} r={8} fill="#e5e5e5" stroke="#171717" strokeWidth={0.5} />
                  <circle cx={cx} cy={cy} r={2} fill="#171717" />
                </g>
              );
            })}
            <text x={w / 2} y={h - 10} textAnchor="middle" fontSize={7} fill="#999">Cocktail / Standing</text>
          </>
        );
      }
    }
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[280px]" style={{ height: 'auto' }}>
      <rect width={w} height={h} rx={8} fill="#FAFAFA" />
      {renderLayout()}
    </svg>
  );
}

// ─── Proposal Comparison Card ───

function ProposalComparisonCard({ drafts }: { drafts: ProposalDraft[] }) {
  if (drafts.length < 2) return null;
  
  const fmt = (n: number, currency: string) =>
    new Intl.NumberFormat('en-IE', { style: 'currency', currency: currency || 'EUR' }).format(n);

  return (
    <div className="w-full max-w-2xl venue-card-enter">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gray-900 px-5 py-3 flex items-center gap-2">
          <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <h4 className="text-sm font-semibold text-white">Proposal Comparison</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase">Item</th>
                {drafts.map((d, i) => (
                  <th key={i} className="px-4 py-2.5 text-right text-xs font-medium text-gray-400 uppercase">
                    Round {d.negotiation_round || i + 1}
                    {d.discount_applied > 0 && (
                      <span className="ml-1 text-green-600">-{d.discount_applied}%</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drafts[0].items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-gray-700">{item.name}</td>
                  {drafts.map((d, di) => {
                    const dItem = d.items[idx];
                    const prev = di > 0 ? drafts[di - 1].items[idx] : null;
                    const changed = prev && dItem && prev.total !== dItem.total;
                    return (
                      <td key={di} className={cn('px-4 py-2 text-right font-medium', changed ? (dItem.total < (prev?.total || 0) ? 'text-green-600' : 'text-red-600') : 'text-gray-700')}>
                        {dItem ? fmt(dItem.total, d.currency) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="px-4 py-2.5 text-gray-900">Total</td>
                {drafts.map((d, di) => {
                  const prev = di > 0 ? drafts[di - 1] : null;
                  const changed = prev && prev.total !== d.total;
                  return (
                    <td key={di} className={cn('px-4 py-2.5 text-right', changed ? 'text-green-600' : 'text-gray-900')}>
                      {fmt(d.total, d.currency)}
                      {changed && prev && (
                        <span className="block text-[0.65rem] font-normal text-green-500">
                          Save {fmt(prev.total - d.total, d.currency)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const VENUE_IMAGES: Record<string, { url: string; label: string }> = {
  room: {
    url: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&h=400&fit=crop&q=80',
    label: 'Hotel Room / Suite',
  },
  boardroom: {
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=400&fit=crop&q=80',
    label: 'Boardroom',
  },
  banquet: {
    url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&h=400&fit=crop&q=80',
    label: 'Banquet Hall',
  },
  conference: {
    url: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&h=400&fit=crop&q=80',
    label: 'Conference Room',
  },
  garden: {
    url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&h=400&fit=crop&q=80',
    label: 'Garden / Outdoor',
  },
  restaurant: {
    url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=400&fit=crop&q=80',
    label: 'Restaurant / Dining',
  },
  pool: {
    url: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&h=400&fit=crop&q=80',
    label: 'Poolside',
  },
};

function getVenueImage(venueType?: string | null): { url: string; label: string } | null {
  if (!venueType) return null;
  return VENUE_IMAGES[venueType] || null;
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function generateTitle(messages: UIMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === 'user' && !getMessageText(m).startsWith('[ACTION:'));
  if (!firstUserMsg) return 'New Chat';
  const text = getMessageText(firstUserMsg);
  return text.length > 50 ? text.slice(0, 50) + '\u2026' : text;
}

function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function getThinkingLabel(toolName: string): string {
  const labels: Record<string, string> = {
    searchProposals: 'Searching proposals...',
    getProposal: 'Fetching proposal details...',
    createProposal: 'Creating proposal...',
    patchProposal: 'Updating proposal...',
    generateProposalDraft: 'Generating proposal...',
    reviseProposalPricing: 'Revising pricing...',
    listContent: 'Loading content...',
    listCompanies: 'Loading companies...',
    listTemplates: 'Loading templates...',
    analyzePortfolio: 'Analyzing portfolio...',
    renderChart: 'Generating visualization...',
    queryProposalData: 'Analyzing data...',
    suggestPricing: 'Calculating pricing...',
    extractEventDetails: 'Processing event details...',
    acceptProposal: 'Confirming booking...',
    checkAvailability: 'Checking venue availability...',
    calculateEventPrice: 'Calculating event price...',
    bookSpace: 'Reserving venue...',
    getMonthAvailability: 'Loading availability calendar...',
    suggestFloorPlan: 'Designing floor plan...',
  };
  return labels[toolName] || 'Thinking...';
}

function formatMarkdown(text: string): string {
  // Convert markdown tables to HTML tables before other transformations
  text = text.replace(
    /((?:^\|.+\|$\n?)+)/gm,
    (tableBlock) => {
      const rows = tableBlock.trim().split('\n').filter(Boolean);
      if (rows.length < 2) return tableBlock;

      // Check if second row is a separator (|---|---|)
      const isSeparator = (row: string) => /^\|[\s-:|]+\|$/.test(row);
      const sepIdx = rows.findIndex((r) => isSeparator(r));
      if (sepIdx < 0) return tableBlock;

      // Parse alignment from separator row
      const sepCells = rows[sepIdx].split('|').filter(Boolean);
      const aligns = sepCells.map((c) => {
        const t = c.trim();
        if (t.startsWith(':') && t.endsWith(':')) return 'center';
        if (t.endsWith(':')) return 'right';
        return 'left';
      });

      const parseRow = (row: string) =>
        row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map((c) => c.trim());

      const headerRows = rows.slice(0, sepIdx);
      const bodyRows = rows.slice(sepIdx + 1);

      let html = '<div class="overflow-x-auto my-2"><table class="w-full text-sm border-collapse">';

      // Header
      if (headerRows.length > 0) {
        html += '<thead>';
        for (const hr of headerRows) {
          const cells = parseRow(hr);
          html += '<tr class="border-b-2 border-gray-200">';
          cells.forEach((cell, i) => {
            const align = aligns[i] || 'left';
            html += `<th class="px-3 py-2 text-${align} text-xs font-semibold text-gray-600 uppercase">${cell}</th>`;
          });
          html += '</tr>';
        }
        html += '</thead>';
      }

      // Body
      if (bodyRows.length > 0) {
        html += '<tbody>';
        for (const br of bodyRows) {
          const cells = parseRow(br);
          html += '<tr class="border-b border-gray-100">';
          cells.forEach((cell, i) => {
            const align = aligns[i] || 'left';
            html += `<td class="px-3 py-2 text-${align} text-gray-700">${cell}</td>`;
          });
          html += '</tr>';
        }
        html += '</tbody>';
      }

      html += '</table></div>';
      return html;
    },
  );

  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="rounded-lg bg-gray-50 p-3 text-xs overflow-x-auto"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4">$2</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}
