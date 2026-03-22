'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import Link from 'next/link';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LANDING PAGE — Proposales Platform
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ─── Intersection Observer Hook ─── */
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/* ─── Animated Counter ─── */
function Counter({ end, suffix = '', duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const { ref, visible } = useReveal(0.3);

  useEffect(() => {
    if (!visible) return;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * end));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [visible, end, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

/* ─── Floating Orbs Background ─── */
function FloatingOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Large gradient blobs */}
      <div className="landing-orb absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-gray-200/25 blur-[100px]" />
      <div className="landing-orb-delayed absolute -bottom-60 -right-40 h-[700px] w-[700px] rounded-full bg-gray-300/20 blur-[120px]" />
      <div className="landing-orb absolute left-1/2 top-1/3 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-gray-100/30 blur-[80px]" />
      {/* Small floating particles */}
      {Array.from({ length: 24 }).map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            width: `${4 + (i % 5) * 3}px`,
            height: `${4 + (i % 5) * 3}px`,
            left: `${(i * 13 + 5) % 100}%`,
            top: `${(i * 19 + 8) % 100}%`,
            background: i % 3 === 0 ? '#171717' : i % 3 === 1 ? '#404040' : '#a3a3a3',
            opacity: 0.15 + (i % 4) * 0.05,
            animation: `floatParticle ${14 + (i % 7) * 3}s ease-in-out infinite`,
            animationDelay: `${(i * 0.9) % 8}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Grid Pattern SVG Background ─── */
function GridPattern() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.03]">
      <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}

/* ─── Navbar ─── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'border-b border-white/40 bg-white/70 shadow-lg shadow-gray-900/5 backdrop-blur-xl'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 shadow-md shadow-gray-900/20 transition-transform duration-300 group-hover:scale-110">
            <svg className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-gray-900">Proposales</span>
        </Link>

        {/* Links */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Features</a>
          <a href="#how-it-works" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">How It Works</a>
          <a href="#help" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Help</a>
          <a href="#stats" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">Results</a>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-semibold text-gray-700 transition-colors hover:text-gray-900 sm:block"
          >
            Sign In
          </Link>
          <Link
            href="/login"
            className="relative overflow-hidden rounded-xl bg-gradient-to-r from-gray-800 to-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-gray-900/25 transition-all duration-300 hover:shadow-lg hover:shadow-gray-900/30 hover:-translate-y-0.5"
          >
            <span className="relative z-10">Get Started</span>
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 hover:translate-x-full" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ─── Hero Section ─── */
function HeroSection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16">
      <FloatingOrbs />
      <GridPattern />

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div
            className={`mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-gray-200/60 bg-gray-50/80 px-4 py-1.5 backdrop-blur-sm transition-all duration-700 ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gray-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gray-700" />
            </span>
            <span className="text-xs font-semibold text-gray-700">AI-Powered Proposal Platform</span>
          </div>

          {/* Headline */}
          <h1
            className={`landing-text-reveal text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl ${
              mounted ? 'animate' : ''
            }`}
          >
            <span className="block text-gray-900">Create Winning</span>
            <span className="landing-gradient-text block">Proposals in Minutes</span>
          </h1>

          {/* Subheadline */}
          <p
            className={`mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-500 transition-all delay-300 duration-700 sm:text-xl ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
            }`}
          >
            Harness the power of AI to draft, negotiate, and close event proposals.
            From venue availability to dynamic pricing — all in one intelligent platform.
          </p>

          {/* CTA Buttons */}
          <div
            className={`mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row transition-all delay-500 duration-700 ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
            }`}
          >
            <Link
              href="/login"
              className="landing-cta-primary group relative inline-flex h-14 items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-gray-800 to-gray-900 px-8 text-base font-semibold text-white shadow-xl shadow-gray-900/25 transition-all duration-300 hover:shadow-2xl hover:shadow-gray-900/30 hover:-translate-y-1"
            >
              <span className="relative z-10">Start Building Proposals</span>
              <svg className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              {/* Shimmer */}
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </Link>
            <a
              href="#features"
              className="group inline-flex h-14 items-center gap-2 rounded-2xl border border-gray-200/80 bg-white/60 px-8 text-base font-semibold text-gray-700 backdrop-blur-sm transition-all duration-300 hover:border-gray-300 hover:bg-white hover:text-gray-900 hover:-translate-y-1"
            >
              See How It Works
              <svg className="h-5 w-5 transition-transform duration-300 group-hover:translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </a>
            <a
              href="#help"
              className="group inline-flex h-14 items-center gap-2 rounded-2xl border border-gray-200/80 bg-white/60 px-8 text-base font-semibold text-gray-700 backdrop-blur-sm transition-all duration-300 hover:border-gray-300 hover:bg-white hover:text-gray-900 hover:-translate-y-1"
            >
              Help & Roles
              <svg className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9a3.75 3.75 0 117.5 0c0 1.216-.667 2.206-1.75 2.919-.87.573-1.75 1.172-1.75 2.331v.75M12 18h.008v.008H12V18z" />
              </svg>
            </a>
          </div>

          {/* Hero Mockup / Dashboard Preview */}
          <div
            className={`mx-auto mt-20 max-w-5xl transition-all delay-700 duration-1000 ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
            }`}
          >
              <div className="landing-hero-card relative rounded-2xl border border-white/50 bg-white/50 p-2 shadow-2xl shadow-gray-900/10 backdrop-blur-sm">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 rounded-t-xl bg-gray-100/80 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400/80" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400/80" />
                  <div className="h-3 w-3 rounded-full bg-green-400/80" />
                </div>
                <div className="ml-3 flex-1 rounded-lg bg-white/80 px-4 py-1.5 text-xs text-gray-400">
                  proposales.app/dashboard
                </div>
              </div>
              {/* Mock dashboard content */}
              <div className="rounded-b-xl bg-gradient-to-br from-gray-50 to-white p-6 sm:p-8">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { label: 'Total Proposals', value: '248', change: '+12%', color: 'brand' },
                    { label: 'Revenue Managed', value: '$1.2M', change: '+18%', color: 'success' },
                    { label: 'Win Rate', value: '73%', change: '+5%', color: 'brand' },
                    { label: 'Avg Response Time', value: '2.4h', change: '-32%', color: 'success' },
                  ].map((stat, i) => (
                    <div
                      key={stat.label}
                      className="landing-stat-card rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                      style={{ animationDelay: `${0.8 + i * 0.15}s` }}
                    >
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-gray-400">{stat.label}</p>
                      <p className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">{stat.value}</p>
                      <span className={`mt-1 inline-flex text-xs font-semibold ${stat.color === 'success' ? 'text-success-600' : 'text-gray-700'}`}>
                        {stat.change}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Mock chart area */}
                <div className="mt-6 flex items-end justify-between gap-1 rounded-xl border border-gray-100 bg-gray-50/50 px-6 py-8">
                  {[40, 65, 45, 80, 55, 95, 70, 85, 60, 90, 75, 100].map((h, i) => (
                    <div key={i} className="landing-bar flex-1 rounded-t-md bg-gradient-to-t from-gray-600 to-gray-800" style={{ height: `${h}%`, maxHeight: `${h}px`, animationDelay: `${1.2 + i * 0.08}s` }} />
                  ))}
                </div>
              </div>
              {/* Glow effect behind card */}
              <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-r from-gray-200/20 via-gray-300/10 to-gray-200/20 blur-2xl" />
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <div className="landing-scroll-indicator flex flex-col items-center gap-2">
          <span className="text-[0.6rem] font-semibold uppercase tracking-widest text-gray-400">Scroll</span>
          <div className="h-8 w-5 rounded-full border-2 border-gray-300/60">
            <div className="landing-scroll-dot mx-auto mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Feature Card ─── */
function FeatureCard({ icon, title, desc, delay }: { icon: ReactNode; title: string; desc: string; delay: number }) {
  const { ref, visible } = useReveal();

  return (
    <div
      ref={ref}
      className={`group relative rounded-2xl border border-gray-100 bg-white/70 p-8 backdrop-blur-sm transition-all duration-700 hover:border-gray-200 hover:shadow-xl hover:shadow-gray-900/5 hover:-translate-y-2 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Icon */}
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 text-gray-700 shadow-sm transition-all duration-500 group-hover:scale-110 group-hover:shadow-md group-hover:shadow-gray-200/40">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">{desc}</p>
      {/* Hover gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 scale-x-0 rounded-b-2xl bg-gradient-to-r from-gray-600 to-gray-900 transition-transform duration-500 group-hover:scale-x-100" />
    </div>
  );
}

/* ─── Features Section ─── */
function FeaturesSection() {
  const { ref, visible } = useReveal();

  const features = [
    {
      icon: (
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      ),
      title: 'AI Proposal Drafting',
      desc: 'Describe your event and let AI craft a complete, professionally formatted proposal with dynamic pricing and package options.',
    },
    {
      icon: (
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      ),
      title: 'Real-Time Availability',
      desc: 'Check venue space availability instantly across all event spaces. No double-bookings, no back-and-forth emails.',
    },
    {
      icon: (
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: 'Dynamic Pricing Engine',
      desc: 'Smart pricing that adapts to demand, seasonality, and event type. Maximize revenue while staying competitive.',
    },
    {
      icon: (
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
        </svg>
      ),
      title: 'Portfolio Analytics',
      desc: 'Deep insights into proposal performance, revenue trends, win rates, and pipeline health with AI-powered recommendations.',
    },
    {
      icon: (
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
        </svg>
      ),
      title: 'AI Negotiation Assistant',
      desc: 'Let AI handle counter-offers and pricing negotiations intelligently, keeping both parties satisfied while protecting margins.',
    },
    {
      icon: (
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      ),
      title: 'E-Sign & Auto-Book',
      desc: 'Clients accept proposals with one click. Venues auto-book in the PMS. Send confirmation emails instantly.',
    },
  ];

  return (
    <section id="features" className="relative py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section Header */}
        <div
          ref={ref}
          className={`mx-auto max-w-2xl text-center transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <span className="text-sm font-bold uppercase tracking-widest text-gray-500">Features</span>
          <h2 className="mt-3 text-4xl font-extrabold text-gray-900 sm:text-5xl">
            Everything You Need to{' '}
            <span className="landing-gradient-text">Close Deals Faster</span>
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            A complete AI-powered toolkit for creating, managing, and winning event proposals.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <FeatureCard key={f.title} {...f} delay={i * 100} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works Section ─── */
function HowItWorksSection() {
  const { ref: titleRef, visible: titleVisible } = useReveal();

  const steps = [
    {
      step: '01',
      title: 'Describe Your Event',
      desc: 'Tell the AI what you need — event type, guest count, preferred dates, and budget. Or simply chat naturally.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
      ),
    },
    {
      step: '02',
      title: 'AI Checks & Configures',
      desc: 'The platform checks real-time venue availability, calculates dynamic pricing, and assembles the perfect package.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
        </svg>
      ),
    },
    {
      step: '03',
      title: 'Review & Send',
      desc: 'Get a polished proposal ready for review. Tweak pricing, add packages, then send it directly to your client.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      ),
    },
    {
      step: '04',
      title: 'Close & Auto-Book',
      desc: 'Client accepts with one click. The venue auto-books in your PMS. Confirmation emails sent instantly.',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
        </svg>
      ),
    },
  ];

  return (
    <section id="how-it-works" className="relative overflow-hidden bg-gradient-to-b from-gray-50/50 to-white py-32">
      {/* Subtle bg */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-0 h-[500px] w-[500px] rounded-full bg-gray-100/20 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div
          ref={titleRef}
          className={`mx-auto max-w-2xl text-center transition-all duration-700 ${
            titleVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <span className="text-sm font-bold uppercase tracking-widest text-gray-500">How It Works</span>
          <h2 className="mt-3 text-4xl font-extrabold text-gray-900 sm:text-5xl">
            From Chat to{' '}
            <span className="landing-gradient-text">Closed Deal</span>
          </h2>
          <p className="mt-4 text-lg text-gray-500">Four simple steps powered by artificial intelligence.</p>
        </div>

        {/* Steps */}
        <div className="mt-20 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => {
            const { ref, visible } = useReveal(); // eslint-disable-line react-hooks/rules-of-hooks
            return (
              <div
                key={s.step}
                ref={ref}
                className={`group relative transition-all duration-700 ${
                  visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                }`}
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div className="absolute -right-4 top-10 hidden h-px w-8 bg-gradient-to-r from-gray-300 to-gray-100 lg:block" />
                )}
                {/* Step number */}
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-700 to-gray-900 text-sm font-bold text-white shadow-lg shadow-gray-900/20 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                    {s.icon}
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Step {s.step}</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Help Section ─── */
function HelpSection() {
  const { ref, visible } = useReveal();

  return (
    <section id="help" className="relative bg-gradient-to-b from-white to-gray-50/50 py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div
          ref={ref}
          className={`mx-auto max-w-3xl text-center transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <span className="text-sm font-bold uppercase tracking-widest text-gray-500">Help</span>
          <h2 className="mt-3 text-4xl font-extrabold text-gray-900 sm:text-5xl">
            Roles, Access &{' '}
            <span className="landing-gradient-text">How to Use</span>
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            Understand what Guest and Sales users can access, what features are available, and the fastest way to get started.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-4 inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-700">
              Guest Role
            </div>
            <h3 className="text-xl font-bold text-gray-900">For hotel guests and event customers</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-gray-600">
              <li>• Access only your own proposals and booking-related details.</li>
              <li>• Use AI concierge for rooms, boardrooms, event venues, and pricing guidance.</li>
              <li>• Review proposal options, request changes, and continue conversations.</li>
              <li>• No access to internal sales analytics, pipeline, or other customer data.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-4 inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-700">
              Sales Role
            </div>
            <h3 className="text-xl font-bold text-gray-900">For revenue and sales teams</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-gray-600">
              <li>• Access full proposal pipeline views across stages and statuses.</li>
              <li>• Use AI chat to generate proposal drafts from event requirements and convert them into live proposals.</li>
              <li>• Use analytics chat for trends, comparisons, KPIs, and visual dashboards.</li>
              <li>• Revise pricing/packages with AI and manage proposals from dashboard workflows.</li>
              <li>• Monitor outcomes and optimize conversion using data insights.</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <h3 className="text-xl font-bold text-gray-900">How to use Proposales quickly</h3>
          <div className="mt-4 grid gap-4 text-sm text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">1. Sign in</p>
              <p className="mt-1">Log in with your approved account and role.</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">2. Open dashboard</p>
              <p className="mt-1">Navigate to proposals, analytics, and content tools.</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">3. Use AI features</p>
              <p className="mt-1">Guest: concierge help. Sales: generate proposals, revise pricing, and run analytics.</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">4. Take action</p>
              <p className="mt-1">Send proposals, track progress, and follow up fast.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Stats Section ─── */
function StatsSection() {
  const { ref, visible } = useReveal();

  const stats = [
    { value: 10000, suffix: '+', label: 'Proposals Created' },
    { value: 4.8, suffix: 'M', label: 'Revenue Managed' },
    { value: 73, suffix: '%', label: 'Average Win Rate' },
    { value: 2, suffix: 'min', label: 'Avg Draft Time' },
  ];

  return (
    <section id="stats" className="relative py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div
          ref={ref}
          className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900 px-8 py-16 shadow-2xl shadow-gray-900/25 transition-all duration-1000 sm:px-16 sm:py-20 ${
            visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'
          }`}
        >
          {/* Background decoration */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-white/5 blur-2xl" />
            {/* Grid overlay */}
            <div className="absolute inset-0 opacity-[0.05]">
              <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="stat-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#stat-grid)" />
              </svg>
            </div>
          </div>

          {/* Content */}
          <div className="relative">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                Trusted by Venue Teams Worldwide
              </h2>
              <p className="mt-3 text-lg text-gray-300/80">Real results from real teams using Proposales.</p>
            </div>

            <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-4xl font-extrabold text-white sm:text-5xl">
                    {s.suffix === 'M' ? (
                      <><span>$</span><Counter end={s.value} suffix={s.suffix} /></>
                    ) : (
                      <Counter end={s.value} suffix={s.suffix} />
                    )}
                  </p>
                  <p className="mt-2 text-sm font-medium text-gray-300/70">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Testimonial Section ─── */
function TestimonialSection() {
  const { ref, visible } = useReveal();

  const testimonials = [
    {
      quote: "Proposales cut our proposal turnaround from 2 days to 15 minutes. The AI understands exactly what our clients need.",
      author: 'Sarah Chen',
      role: 'Director of Events, Grand Meridian Hotel',
      avatar: 'SC',
    },
    {
      quote: "The dynamic pricing engine alone paid for itself in the first month. We're capturing 23% more revenue per event.",
      author: 'Marcus Rivera',
      role: 'Revenue Manager, Skyline Venues',
      avatar: 'MR',
    },
    {
      quote: "Our clients love the instant proposals. The e-sign feature means we close deals before competitors even respond.",
      author: 'Emma Lindström',
      role: 'Sales Lead, Nordic Conference Center',
      avatar: 'EL',
    },
  ];

  return (
    <section className="relative bg-gradient-to-b from-white to-gray-50/50 py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div
          ref={ref}
          className={`mx-auto max-w-2xl text-center transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <span className="text-sm font-bold uppercase tracking-widest text-gray-500">Testimonials</span>
          <h2 className="mt-3 text-4xl font-extrabold text-gray-900 sm:text-5xl">
            Loved by{' '}
            <span className="landing-gradient-text">Event Professionals</span>
          </h2>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {testimonials.map((t, i) => {
            const { ref, visible } = useReveal(); // eslint-disable-line react-hooks/rules-of-hooks
            return (
              <div
                key={t.author}
                ref={ref}
                className={`group relative rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition-all duration-700 hover:shadow-lg hover:shadow-gray-900/5 hover:-translate-y-1 ${
                  visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                }`}
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                {/* Quote mark */}
                <svg className="mb-4 h-8 w-8 text-gray-200" fill="currentColor" viewBox="0 0 32 32">
                  <path d="M10 8c-3.3 0-6 2.7-6 6v10h10V14H8c0-1.1.9-2 2-2V8zm14 0c-3.3 0-6 2.7-6 6v10h10V14h-6c0-1.1.9-2 2-2V8z" />
                </svg>
                <p className="text-sm leading-relaxed text-gray-600">{t.quote}</p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gray-600 to-gray-900 text-xs font-bold text-white">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.author}</p>
                    <p className="text-xs text-gray-500">{t.role}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── CTA Section ─── */
function CTASection() {
  const { ref, visible } = useReveal();

  return (
    <section className="relative py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div
          ref={ref}
          className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-8 py-20 text-center shadow-2xl transition-all duration-1000 sm:px-16 ${
            visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'
          }`}
        >
          {/* BG effects */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-[120px]" />
            <div className="absolute bottom-0 left-1/4 h-60 w-60 rounded-full bg-white/5 blur-3xl" />
          </div>

          <div className="relative">
            <h2 className="text-4xl font-extrabold text-white sm:text-5xl">
              Ready to Transform Your{' '}
              <span className="bg-gradient-to-r from-gray-200 to-gray-400 bg-clip-text text-transparent">
                Proposal Workflow?
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-gray-400">
              Join thousands of venue teams creating winning proposals with AI. Get started for free — no credit card required.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/login"
                className="group relative inline-flex h-14 items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-gray-100 to-white px-8 text-base font-semibold text-gray-900 shadow-xl shadow-white/25 transition-all duration-300 hover:shadow-2xl hover:shadow-white/30 hover:-translate-y-1"
              >
                <span className="relative z-10">Get Started Free</span>
                <svg className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-14 items-center gap-2 rounded-2xl border border-gray-700 px-8 text-base font-semibold text-gray-300 transition-all duration-300 hover:border-gray-500 hover:text-white hover:-translate-y-1"
              >
                Watch Demo
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gray-700 to-gray-900">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-900">Proposales</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="#features" className="transition-colors hover:text-gray-900">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-gray-900">How It Works</a>
            <a href="#help" className="transition-colors hover:text-gray-900">Help</a>
            <Link href="/login" className="transition-colors hover:text-gray-900">Sign In</Link>
          </div>

          {/* Copyright */}
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} Proposales. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Main Page Component
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-gray-50/30 via-white to-white">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <HelpSection />
      <StatsSection />
      <TestimonialSection />
      <CTASection />
      <Footer />
    </div>
  );
}
