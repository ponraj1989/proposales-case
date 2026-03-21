'use client';

import { useState, useEffect, Suspense, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

/* ─── Mesh gradient background with animated particles ─── */
function AnimatedBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Animated mesh gradient */}
      <div className="login-mesh absolute inset-0 opacity-60" />

      {/* Floating orbs */}
      <div className="login-orb-1 absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-gray-400/10 blur-3xl" />
      <div className="login-orb-2 absolute -right-20 bottom-1/4 h-80 w-80 rounded-full bg-gray-300/10 blur-3xl" />
      <div className="login-orb-3 absolute left-1/3 -top-20 h-64 w-64 rounded-full bg-gray-200/10 blur-3xl" />

      {/* Floating particles */}
      {Array.from({ length: 24 }).map((_, i) => (
        <span
          key={i}
          className="login-particle absolute rounded-full"
          style={{
            width: `${4 + (i % 4) * 3}px`,
            height: `${4 + (i % 4) * 3}px`,
            left: `${(i * 13 + 5) % 100}%`,
            top: `${(i * 19 + 8) % 100}%`,
            background: i % 4 === 0 ? '#171717' : i % 4 === 1 ? '#404040' : i % 4 === 2 ? '#a3a3a3' : '#737373',
            opacity: 0.15 + (i % 5) * 0.05,
            animation: `loginFloat ${10 + (i % 7) * 3}s ease-in-out infinite`,
            animationDelay: `${(i * 0.5) % 8}s`,
          }}
        />
      ))}

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.4) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  );
}

/* ─── Animated logo icon with pulse ring ─── */
function LogoIcon() {
  return (
    <div className="login-logo group relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
      {/* Pulse rings */}
      <div className="login-pulse-ring absolute inset-0 rounded-3xl border-2 border-gray-400/20" />
      <div className="login-pulse-ring-delayed absolute inset-0 rounded-3xl border-2 border-gray-400/15" />
      {/* Glow */}
      <div className="absolute inset-0 rounded-3xl bg-gray-900/10 blur-xl transition-all duration-700 group-hover:bg-gray-900/15 group-hover:blur-2xl" />
      {/* Icon body */}
      <div className="login-icon-body relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900 shadow-lg shadow-gray-900/30 transition-transform duration-500 hover:scale-105">
        <svg className="h-9 w-9 text-white drop-shadow-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {/* Shine streak */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl">
          <div className="login-shine absolute -left-full top-0 h-full w-1/2 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </div>
      </div>
    </div>
  );
}

/* ─── Animated typing text ─── */
function TypedSubtitle() {
  const phrases = ['your AI-powered dashboard', 'smart proposal analytics', 'automated event booking'];
  const [idx, setIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    const phrase = phrases[idx];
    let timer: ReturnType<typeof setTimeout>;
    if (typing) {
      if (displayed.length < phrase.length) {
        timer = setTimeout(() => setDisplayed(phrase.slice(0, displayed.length + 1)), 60);
      } else {
        timer = setTimeout(() => setTyping(false), 2000);
      }
    } else {
      if (displayed.length > 0) {
        timer = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 30);
      } else {
        setIdx((i) => (i + 1) % phrases.length);
        setTyping(true);
      }
    }
    return () => clearTimeout(timer);
  }, [displayed, typing, idx]);

  return (
    <p className="login-subtitle mt-2 text-sm text-gray-500">
      Sign in to access{' '}
      <span className="inline-block min-w-[10ch] text-gray-700 font-medium">
        {displayed}
        <span className="login-cursor ml-px inline-block h-4 w-[2px] align-middle bg-gray-700" />
      </span>
    </p>
  );
}

/* ─── Feature pill tags ─── */
function FeaturePills() {
  const features = [
    { label: 'AI-Powered', icon: '✦' },
    { label: 'Smart Analytics', icon: '◈' },
    { label: 'Auto Proposals', icon: '◉' },
  ];
  return (
    <div className="login-features mt-5 flex flex-wrap items-center justify-center gap-2">
      {features.map((f, i) => (
        <span
          key={f.label}
          className="login-pill inline-flex items-center gap-1.5 rounded-full border border-gray-200/60 bg-gray-50/80 px-3.5 py-1.5 text-xs font-medium text-gray-700 backdrop-blur-sm transition-all duration-300 hover:border-gray-300 hover:bg-gray-100/80 hover:scale-105"
          style={{ animationDelay: `${0.7 + i * 0.1}s` }}
        >
          <span className="text-[0.6rem] text-gray-400">{f.icon}</span>
          {f.label}
        </span>
      ))}
    </div>
  );
}

/* ─── Testimonial mini-badges ─── */
function TrustBadge() {
  return (
    <div className="login-trust mt-6 flex items-center justify-center gap-4">
      <div className="flex -space-x-2">
        {['bg-gray-700', 'bg-gray-500', 'bg-gray-400', 'bg-gray-600'].map((bg, i) => (
          <div key={i} className={`flex h-7 w-7 items-center justify-center rounded-full ${bg} text-[0.6rem] font-bold text-white ring-2 ring-white`}>
            {['P', 'R', 'A', 'J'][i]}
          </div>
        ))}
      </div>
      <div className="text-left">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <svg key={s} className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>
        <p className="text-[0.6rem] text-gray-400">Trusted by event teams</p>
      </div>
    </div>
  );
}

function LoginContent() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showKeyLogin, setShowKeyLogin] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const authError = searchParams.get('error');

  useEffect(() => setMounted(true), []);

  async function handlePasskeySubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey: key }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? 'Invalid passkey');
        return;
      }

      if (data.role === 'sales') {
        router.push('/dashboard');
      } else {
        router.push('/dashboard/ai');
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError('');
    try {
      await signIn('google', { callbackUrl: '/dashboard' });
    } catch {
      setError('Failed to initiate Google sign-in.');
      setGoogleLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-gray-50">
      {/* Animated background */}
      <AnimatedBackground />

      {/* Card */}
      <div
        className={`relative z-10 w-full max-w-[26rem] px-4 transition-all duration-700 ease-out ${
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
        }`}
      >
        {/* Glow behind card */}
        <div className="login-card-glow absolute -inset-4 rounded-3xl bg-gray-900/[0.05] blur-2xl" />

          <div className="login-card relative rounded-3xl border border-white/70 bg-white/85 p-8 shadow-2xl shadow-gray-900/[0.08] backdrop-blur-2xl sm:p-10">
          {/* Gradient border accent */}
          <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-gray-400/50 to-transparent" />

          {/* Header */}
          <div className="mb-8 text-center">
            <LogoIcon />
            <h1 className="login-title bg-gradient-to-r from-gray-900 via-gray-700 to-gray-500 bg-clip-text text-[1.75rem] font-extrabold leading-tight text-transparent">
              Proposales
            </h1>
            <TypedSubtitle />
            <FeaturePills />
          </div>

          {/* Error messages */}
          {(error || authError) && (
            <div className="login-shake mb-5 flex items-start gap-2.5 rounded-xl border border-error-200 bg-error-50 p-3.5">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-error-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-error-700">
                {error || (authError === 'AccessDenied'
                  ? 'Access denied. Your email is not authorized.'
                  : 'Authentication failed. Please try again.')}
              </p>
            </div>
          )}

          {/* Google Sign-In */}
          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="login-google group relative flex h-[3.25rem] w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-gray-200/80 bg-white text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:border-gray-300 hover:shadow-lg hover:shadow-gray-900/10 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-0"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-gray-100/60 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
            {googleLoading ? (
              <svg className="h-5 w-5 animate-spin text-gray-700" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <>
                <svg className="relative h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span className="relative">Continue with Google</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
            <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-gray-300">or</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
          </div>

          {/* Passkey Login */}
          {!showKeyLogin ? (
            <button
              onClick={() => setShowKeyLogin(true)}
              className="group flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 transition-all duration-300 hover:border-gray-400 hover:bg-gray-50/50 hover:text-gray-700"
            >
              <svg className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Sign in with Passkey
            </button>
          ) : (
            <form onSubmit={handlePasskeySubmit} className="animate-in space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="passkey" className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Passkey
                </label>
                <div className="group relative">
                  <input
                    id="passkey"
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="Enter your passkey"
                    required
                    autoFocus
                    className="flex h-12 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 text-sm transition-all duration-300 placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-700/20"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !key}
                className="login-submit relative flex h-12 w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-gray-800 to-gray-900 text-sm font-semibold text-white shadow-md shadow-gray-900/25 transition-all duration-300 hover:shadow-lg hover:shadow-gray-900/35 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 disabled:opacity-50 disabled:hover:translate-y-0 active:translate-y-0"
              >
                {loading ? (
                  <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <>Sign In</>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setShowKeyLogin(false); setKey(''); setError(''); }}
                className="flex w-full items-center justify-center text-xs text-gray-400 transition-colors hover:text-gray-600"
              >
                Back to options
              </button>
            </form>
          )}

          {/* Trust badge */}
          <TrustBadge />

          {/* Footer */}
          <div className="mt-5 flex items-center justify-center gap-1.5 text-[0.6rem] text-gray-400">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secured with enterprise-grade encryption
          </div>
        </div>
      </div>
    </div>
  );
}
