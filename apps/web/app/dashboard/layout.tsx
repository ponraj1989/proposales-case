'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@proposales/ui';
import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useUser, useActivityFeed, type ActivityFeedEvent } from '@/lib/hooks';

// ─── Live Webhook Activity Feed ───

const EVENT_ICONS: Record<ActivityFeedEvent['type'], { icon: string; color: string }> = {
  viewed: { icon: '👁️', color: 'bg-gray-100 text-gray-600' },
  signed: { icon: '✍️', color: 'bg-green-100 text-green-600' },
  commented: { icon: '💬', color: 'bg-amber-100 text-amber-600' },
  created: { icon: '📄', color: 'bg-gray-200 text-gray-700' },
  sent: { icon: '📤', color: 'bg-gray-100 text-gray-600' },
  rejected: { icon: '✕', color: 'bg-red-100 text-red-600' },
  expired: { icon: '⏰', color: 'bg-red-100 text-red-600' },
  updated: { icon: '✏️', color: 'bg-gray-100 text-gray-600' },
};

function timeAgo(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return 'just now';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const salesNavigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    name: 'Proposals',
    href: '/dashboard/proposals',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    name: 'Content',
    href: '/dashboard/content',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
  {
    name: 'Companies',
    href: '/dashboard/companies',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18m16.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
  },
  {
    name: 'Analytics',
    href: '/dashboard/analytics',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    name: 'PMS',
    href: '/dashboard/pms',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
      </svg>
    ),
  },
  {
    name: 'AI Assistant',
    href: '/dashboard/ai',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
  },
];

const customerNavigation = [
  {
    name: 'AI Assistant',
    href: '/dashboard/ai',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
  },
  {
    name: 'My Proposals',
    href: '/dashboard/bookings',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const { data: user, isLoading: userLoading } = useUser();
  const { data: activityData, mutate: mutateActivity } = useActivityFeed((user?.role ?? null) === 'sales');

  const role = user?.role ?? null;
  const activityEvents = activityData?.data ?? [];
  const unreadCount = activityEvents.length;
  const navigation = role === 'sales' ? salesNavigation : customerNavigation;

  const userName = user?.name ?? null;
  const userEmail = user?.email ?? null;
  const userImage = user?.image ?? null;
  const mutateActivityRef = useRef(mutateActivity);

  useEffect(() => {
    mutateActivityRef.current = mutateActivity;
  }, [mutateActivity]);

  useEffect(() => {
    if (role !== 'sales') return;

    let stream: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      stream = new EventSource('/api/activity-feed/stream');

      stream.addEventListener('activity', (event) => {
        const message = event as MessageEvent<string>;
        let incoming: ActivityFeedEvent | null = null;
        try {
          incoming = JSON.parse(message.data) as ActivityFeedEvent;
        } catch {
          return;
        }
        if (!incoming) return;
        const parsed = incoming;

        void mutateActivityRef.current(
          (previous) => {
            const existing = previous?.data ?? [];
            const next = [parsed, ...existing.filter((entry) => entry.id !== parsed.id)].slice(0, 50);
            return { data: next };
          },
          { revalidate: false },
        );
      });

      stream.onerror = () => {
        stream?.close();
        stream = null;

        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      stream?.close();
    };
  }, [role]);

  // Show loading skeleton until role is determined
  if (userLoading || !role) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 animate-pulse">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="text-sm text-gray-500">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  async function handleLogout() {
    // Clear API key session
    await fetch('/api/auth', { method: 'DELETE' });
    // Sign out of NextAuth (Google) if this was a Google user
    if (user?.email) {
      await signOut({ callbackUrl: '/login' });
    } else {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-gray-900">Proposales</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn('sidebar-link', isActive && 'sidebar-link-active')}
              >
                {item.icon}
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-200 p-3">
          {/* User info from Google session */}
          {userName && (
            <div className="mb-3 flex items-center gap-3 px-3 py-2">
              {userImage ? (
                <img
                  src={userImage}
                  alt={userName}
                  className="h-8 w-8 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{userName}</p>
                {userEmail && (
                  <p className="truncate text-xs text-gray-500">{userEmail}</p>
                )}
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="sidebar-link w-full text-error-600 hover:bg-error-50 hover:text-error-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            {/* Activity Feed Bell */}
            {role === 'sales' && (
              <button
                onClick={() => setActivityOpen(!activityOpen)}
                className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
            <span className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              role === 'sales'
                ? 'bg-gray-100 text-gray-700'
                : 'bg-emerald-100 text-emerald-700'
            )}>
              {role === 'sales' ? 'Sales' : 'Guest'}
            </span>
            <span className="text-xs font-medium text-gray-400">Powered by Proposales API</span>
          </div>
        </header>

        {/* Activity Feed Panel */}
        {activityOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setActivityOpen(false)} />
            <div className="absolute right-0 top-16 z-40 w-96 max-h-[calc(100vh-5rem)] overflow-hidden rounded-bl-2xl border-b border-l border-gray-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">Activity Feed</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[0.6rem] font-bold text-gray-700">LIVE</span>
                </div>
                <button onClick={() => setActivityOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto max-h-[calc(100vh-10rem)] divide-y divide-gray-50">
                {activityEvents.length === 0 && (
                  <div className="px-5 py-8 text-center text-sm text-gray-400">
                    No recent activity yet
                  </div>
                )}
                {activityEvents.map((evt, i) => {
                  const meta = EVENT_ICONS[evt.type];
                  const fmtAmount = evt.amount
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: evt.currency || 'USD' }).format(evt.amount)
                    : null;
                  return (
                    <div
                      key={evt.id}
                      className="activity-item flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base', meta.color)}>
                        {meta.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        {evt.proposalTitle && (
                          <p className="text-xs font-semibold text-gray-900 truncate">{evt.proposalTitle}</p>
                        )}
                        <p className="text-sm text-gray-700 leading-snug">{evt.description}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-[0.65rem] text-gray-400">{timeAgo(evt.time)}</span>
                          {fmtAmount && (
                            <span className="text-[0.65rem] font-medium text-gray-500">{fmtAmount}</span>
                          )}
                          {evt.proposalUuid && (
                            <Link
                              href={`/dashboard/proposals/${evt.proposalUuid}`}
                              className="text-[0.65rem] font-medium text-blue-500 hover:text-blue-700"
                              onClick={() => setActivityOpen(false)}
                            >
                              View
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto page-enter">
          {children}
        </main>
      </div>
    </div>
  );
}
