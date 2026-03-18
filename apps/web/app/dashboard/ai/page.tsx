'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat, type Message } from '@ai-sdk/react';
import { Button, cn } from '@proposales/ui';
import { ChartCard, type ChartConfig } from '@/components/chat/ChartCard';

// ─── Types ───

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
  negotiation_round: number;
  max_negotiation_rounds: number;
  discount_applied: number;
  is_final_offer?: boolean;
}

interface StoredConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

// ─── LocalStorage helpers ───

const STORAGE_KEY = 'proposales_conversations';

function loadConversations(): StoredConversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistConversations(conversations: StoredConversation[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

function persistConversation(id: string, title: string, messages: Message[]) {
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

const SUGGESTIONS = [
  'Create a proposal for a hotel meeting room with 10 members with food and accommodation',
  'Create a conference proposal for 50 attendees with AV equipment',
  'Show me a chart of proposals by status',
  'Visualize revenue trend by month',
  'Show my win rate trend over time',
  'What are my top companies by proposal count?',
  'Show a pipeline funnel of my proposals',
  'Analyze my sales pipeline',
];

// ─── Main Component ───

export default function AIAssistantPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Initialize conversations from localStorage
  useEffect(() => {
    const stored = loadConversations();
    setConversations(stored);
    if (stored.length > 0) {
      setActiveConvId(stored[0].id);
    } else {
      handleNewChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeConversation = conversations.find((c) => c.id === activeConvId);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setInput,
    append,
    setMessages,
  } = useChat({
    id: activeConvId,
    api: '/api/ai/chat',
    body: { conversationId: activeConvId },
    initialMessages: activeConversation?.messages ?? [],
    onFinish() {
      setTimeout(() => {
        setConversations(loadConversations());
      }, 100);
    },
  });

  // Save messages whenever they change
  useEffect(() => {
    if (activeConvId && messages.length > 0) {
      const title = generateTitle(messages);
      persistConversation(activeConvId, title, messages);
      fetch(`/api/ai/conversations/${activeConvId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: Date.now(),
          })),
        }),
      }).catch(() => {});
    }
  }, [messages, activeConvId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleNewChat() {
    const id = crypto.randomUUID();
    const newConv: StoredConversation = {
      id,
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    const updated = [newConv, ...conversations];
    setConversations(updated);
    persistConversations(updated);
    setActiveConvId(id);
    setMessages([]);
    fetch('/api/ai/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Chat' }),
    }).catch(() => {});
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
    if (activeConvId === id) {
      if (updated.length > 0) {
        setActiveConvId(updated[0].id);
        setMessages(updated[0].messages);
      } else {
        handleNewChat();
      }
    }
    fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  const handleAccept = useCallback(() => {
    append({ role: 'user', content: '[ACTION:ACCEPT_PROPOSAL]' });
  }, [append]);

  const handleReject = useCallback(() => {
    append({ role: 'user', content: '[ACTION:REJECT_PROPOSAL]' });
  }, [append]);

  const handleNegotiate = useCallback(() => {
    append({ role: 'user', content: '[ACTION:NEGOTIATE]' });
  }, [append]);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Conversation Sidebar */}
      <aside
        className={cn(
          'flex w-72 flex-col border-r border-gray-200 bg-white transition-all duration-200',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full absolute lg:relative',
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <span className="text-sm font-semibold text-gray-700">Conversations</span>
          <button
            onClick={handleNewChat}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
            title="New chat"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                'group flex cursor-pointer items-center gap-2 border-b border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50',
                activeConvId === conv.id && 'bg-brand-50 border-brand-100',
              )}
              onClick={() => handleSelectConversation(conv.id)}
            >
              <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{conv.title}</p>
                <p className="text-xs text-gray-400">
                  {new Date(conv.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteConversation(conv.id);
                }}
                className="hidden h-6 w-6 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500 group-hover:flex"
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
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">AI Sales Assistant</h2>
            <p className="text-xs text-gray-500">Create proposals, negotiate pricing, analyze pipeline</p>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <EmptyState suggestions={SUGGESTIONS} onSelect={setInput} />
          )}

          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onAccept={handleAccept}
              onReject={handleReject}
              onNegotiate={handleNegotiate}
              isLoading={isLoading}
            />
          ))}

          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <TypingIndicator />
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask anything — create proposals, visualize data, analyze pipeline..."
              className="flex-1 h-11 rounded-xl border border-gray-300 bg-white px-4 text-sm transition-colors placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </Button>
          </form>
          <p className="mt-2 text-center text-xs text-gray-400">
            AI can make mistakes. Review proposals before sending.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function EmptyState({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (s: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 mb-4">
        <svg className="h-8 w-8 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">How can I help?</h3>
      <p className="text-sm text-gray-500 max-w-md mb-8">
        I can create proposals, negotiate pricing, visualize your data with charts,
        and manage the full proposal lifecycle.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl w-full">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className="text-left rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  onAccept,
  onReject,
  onNegotiate,
  isLoading,
}: {
  message: Message;
  onAccept: () => void;
  onReject: () => void;
  onNegotiate: () => void;
  isLoading: boolean;
}) {
  // Hide action messages — show a pill label instead
  if (message.role === 'user' && message.content.startsWith('[ACTION:')) {
    const label =
      message.content === '[ACTION:ACCEPT_PROPOSAL]'
        ? 'Accepted the proposal'
        : message.content === '[ACTION:REJECT_PROPOSAL]'
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

  // Extract proposal drafts and charts from tool invocations
  const proposalDrafts: ProposalDraft[] = [];
  const charts: ChartConfig[] = [];
  if (message.toolInvocations) {
    for (const invocation of message.toolInvocations) {
      if (
        'result' in invocation &&
        invocation.result &&
        typeof invocation.result === 'object'
      ) {
        const result = invocation.result as Record<string, unknown>;
        if (result.type === 'proposal_draft') {
          proposalDrafts.push(result as unknown as ProposalDraft);
        } else if (result.type === 'chart') {
          charts.push(result as unknown as ChartConfig);
        }
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
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

        {/* Chart Cards */}
        {charts.map((chart, i) => (
          <ChartCard key={`chart-${i}`} config={chart} />
        ))}

        {/* Text content */}
        {message.content && (
          <div
            className={cn(
              'rounded-2xl px-4 py-3 text-sm',
              message.role === 'user'
                ? 'bg-brand-500 text-white'
                : 'bg-white border border-gray-200 text-gray-800',
            )}
          >
            {message.role === 'assistant' ? (
              <div
                className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-brand-600 prose-code:bg-brand-50 prose-code:rounded prose-code:px-1"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
              />
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
        )}

        {/* Tool invocation indicators (non-draft, non-chart tools) */}
        {message.toolInvocations &&
          message.toolInvocations.filter(
            (t) =>
              !('result' in t &&
                t.result &&
                typeof t.result === 'object' &&
                ((t.result as Record<string, unknown>).type === 'proposal_draft' ||
                 (t.result as Record<string, unknown>).type === 'chart')),
          ).length > 0 && (
            <div className="space-y-1">
              {message.toolInvocations
                .filter(
                  (t) =>
                    !('result' in t &&
                      t.result &&
                      typeof t.result === 'object' &&
                      ((t.result as Record<string, unknown>).type === 'proposal_draft' ||
                       (t.result as Record<string, unknown>).type === 'chart')),
                )
                .map((t) => (
                  <div key={t.toolCallId} className="flex items-center gap-2 text-xs text-gray-400">
                    {'result' in t ? (
                      <svg className="h-3 w-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    <span>{formatToolName(t.toolName)}</span>
                  </div>
                ))}
            </div>
          )}
      </div>

      {message.role === 'user' && (
        <div className="flex-shrink-0 mt-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-200">
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
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: draft.currency || 'USD',
    }).format(n);

  return (
    <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-4">
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

      {/* Line Items */}
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
              <tr key={i} className="border-b border-gray-50">
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

      {/* Totals */}
      <div className="border-t border-gray-200 bg-gray-50 px-5 py-3 space-y-1">
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
        <button
          onClick={onAccept}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Accept
        </button>
        {draft.negotiation_round < draft.max_negotiation_rounds ? (
          <button
            onClick={onReject}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Reject
          </button>
        ) : (
          <button
            onClick={onReject}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Decline
          </button>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
        <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex gap-1">
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───

function generateTitle(messages: Message[]): string {
  const firstUserMsg = messages.find((m) => m.role === 'user' && !m.content.startsWith('[ACTION:'));
  if (!firstUserMsg) return 'New Chat';
  const text = firstUserMsg.content;
  return text.length > 50 ? text.slice(0, 50) + '\u2026' : text;
}

function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function formatMarkdown(text: string): string {
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
