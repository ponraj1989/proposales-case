# Proposales Platform

A professional proposal management platform built with **Next.js 14**, **Turborepo**, and the **Proposales API**, featuring AI-powered sales assistant capabilities via **Vercel AI SDK**.

## Architecture

```
proposales-platform/
├── apps/
│   └── web/                   # Next.js 14 App (App Router)
├── packages/
│   ├── api-client/            # Typed Proposales API client + Zod validation
│   ├── ui/                    # Shared UI components (shadcn-inspired)
│   ├── ai/                    # AI tools, prompts, and tool registry
│   ├── theme/                 # Design tokens & Tailwind preset
│   └── config/                # Shared TypeScript configs
├── turbo.json                 # Turborepo pipeline config
├── vercel.json                # Vercel deployment config
└── .env.example               # Required environment variables
```

## Features

- **Dashboard** — KPIs, pipeline value, status distribution, recent proposals
- **Proposals** — Full CRUD, search, filter by status, detail view with blocks/signatures/tracking
- **Content Library** — Create, edit, delete, bulk archive, and restore reusable content blocks
- **Companies** — List companies and view their templates
- **Analytics** — Pipeline funnel, status donut chart, monthly trends, performance metrics, improvement suggestions
- **AI Sales Assistant** — Chat interface powered by Vercel AI SDK with tool-calling capabilities:
  - Create & edit proposals conversationally
  - Analyze sales pipeline & win rates
  - Negotiate pricing with margin-aware suggestions
  - Generate proposal content
  - Provide actionable improvement recommendations
  - Browser voice mode: speech-to-text input
- **Session-Based Conversation Persistence** — AI conversations are stored in Redis and reloaded per authenticated user session

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router, RSC, Server Actions) |
| Monorepo | Turborepo |
| Styling | Tailwind CSS + custom Proposales theme |
| UI | Custom component library (shadcn-inspired) |
| API Client | Typed SDK with Zod validation |
| AI | Vercel AI SDK + OpenAI (tool-calling) |
| Auth | Google OAuth (NextAuth.js) + API key fallback |
| Rate Limiting + Chat Storage | Redis (session-scoped conversation persistence) |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 10

### Setup

1. **Clone the repository**

```bash
git clone <repo-url>
cd proposales-platform
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

```bash
cp .env.example .env.local
```

Fill in:
- `PROPOSALES_API_URL` — Your Proposales API base URL
- `PROPOSALES_API_TOKEN` — Your Proposales API bearer token
- `AUTHORIZED_KEYS` — Comma-separated SHA-256 hashes of authorized login keys
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials (see below)
- `NEXTAUTH_SECRET` — Random secret for NextAuth.js JWT encryption
- `NEXTAUTH_URL` — Your app URL (`http://localhost:3000` for local dev)
- `ALLOWED_EMAILS` — (Optional) Comma-separated emails allowed to sign in via Google
- `ALLOWED_DOMAINS` — (Optional) Comma-separated domains allowed (e.g., `yourcompany.com`)
- `REDIS_URL` — Redis connection URL (used for rate limiting and AI conversation storage)
- `OPENAI_API_KEY` — OpenAI API key (for AI features)

**Generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

**To generate an API key hash:**
```bash
echo -n "your-api-key" | sha256sum
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth client ID**
5. Select **Web application** as the application type
6. Add authorized redirect URIs:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://your-domain.com/api/auth/callback/google`
7. Copy the Client ID and Client Secret to your `.env.local`

> **Access Control**: If `ALLOWED_EMAILS` and `ALLOWED_DOMAINS` are both empty, all Google accounts can sign in. Set one or both to restrict access.

4. **Start development server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the login page.

### Build

```bash
npm run build
```

## Proposal Search Limit (Why we can show more than 25)

The upstream Proposales `proposal-search` endpoint is capped at **25 items per request**.
There is no documented offset/page pagination that we can rely on.

To fetch more than 25 in the app, we use a **fan-out + dedupe** strategy:
- Run one unfiltered search request.
- Run additional search requests per status (`draft`, `active`, `accepted`, `rejected`, `lost`, `expired`, `template`, `withdrawn`, `replaced`).
- Merge all results and deduplicate by proposal UUID.

This increases coverage significantly, but it is not mathematically guaranteed to return every proposal if any single status bucket itself contains more than 25 records.

Implementation references:
- `packages/api-client/src/endpoints/proposals.ts` (`searchAll`)
- `apps/web/app/api/proposales/proposals/route.ts` (status aggregation + enrichment)

## Deploy to Vercel

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Set the environment variables in Vercel project settings
4. Vercel will auto-detect the monorepo and use `vercel.json` configuration
5. Deploy!

The `vercel.json` already configures:
- Build command: `npx turbo build --filter=web`
- Output directory: `apps/web/.next`
- Framework: Next.js

## Security

- **Authentication**: Dual auth — Google OAuth (NextAuth.js) and SHA-256 API key with timing-safe equality
- **Session**: JWT-based (Google OAuth) + httpOnly, secure, sameSite=strict cookies (API key)
- **Access Control**: Optional email/domain whitelisting for Google sign-in
- **Rate Limiting**: Upstash Redis-based (60 req/min API, 20 req/min AI)
- **Conversation Persistence**: Redis-backed, session-scoped conversation storage and retrieval
- **API Proxy**: All Proposales API calls proxied through server — token never exposed to client
- **CSP Headers**: Strict Content-Security-Policy applied to all routes
- **Input Validation**: Zod schemas validate all API inputs server-side

## License

Private — All rights reserved.
