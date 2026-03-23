# Proposales Platform

A professional proposal management platform built with **Next.js 16**, **Turborepo**, and the **Proposales API**, featuring an AI-powered sales assistant, real-time activity feed, guest proposal portal, and mock PMS integration.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (React 19)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Sales        │  │ AI Chat      │  │ Guest Portal             │  │
│  │ Dashboard    │  │ (streaming)  │  │ (My Proposals)           │  │
│  │ + Activity   │  │             │  │ (20s SWR polling)        │  │
│  │   Feed (SSE) │  │             │  │                          │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
└─────────┼─────────────────┼───────────────────────┼────────────────┘
          │ SSE             │ stream                │ SWR fetch
          ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Next.js 16 App (App Router)                     │
│                                                                     │
│  ┌─────────────────────┐   ┌────────────────────────────────────┐  │
│  │ /api/activity-feed  │   │ /api/ai/chat                       │  │
│  │   /stream  (SSE)    │   │  streamText → gateway(AI_MODEL)    │  │
│  │   GET (poll + sync) │   │  onFinish → saveMessages()         │  │
│  └──────────┬──────────┘   └──────────────────┬─────────────────┘  │
│             │                                 │                     │
│  ┌──────────▼──────────┐   ┌──────────────────▼─────────────────┐  │
│  │ /api/webhooks/      │   │ /api/my-proposals                  │  │
│  │   proposales        │◄──│  (merges MongoDB + Proposales API) │  │
│  │ (external webhook   │   └────────────────────────────────────┘  │
│  │  from Proposales    │                                           │
│  │  SaaS platform)     │   ┌────────────────────────────────────┐  │
│  └──────────┬──────────┘   │ /api/mock-pms/*                    │  │
│             │              │  (venue / availability / book)     │  │
│             │              └──────────────────┬─────────────────┘  │
└─────────────┼────────────────────────────────┼────────────────────┘
              │                                 │
     ┌────────▼──────────┐          ┌───────────▼──────────┐
     │       Redis        │          │       MongoDB         │
     │  (ioredis)         │          │  (Mongoose)           │
     │                   │          │                       │
     │ conv:<id>         │          │ Conversation          │
     │ msgs:<id>         │          │ UserProposal          │
     │ user_convs:<uid>  │          │ User                  │
     │ activity:feed     │          │ PmsSpace              │
     │ activity:feed:    │          │ PmsInventory          │
     │   events (pub/sub)│          │ PmsHold               │
     │ activity:feed:    │          │ EmailLog              │
     │   seen (dedup SET)│          │ Event / Booking       │
     │ conv_lang:<id>    │          └───────────────────────┘
     │ proposals:feed:*  │
     │ rate:<key>        │
     └───────────────────┘
              ▲
              │ pub/sub
              │
     ┌────────┴──────────┐
     │  Proposales SaaS  │
     │  API              │
     │                   │
     │  proposals.*      │──── POST /api/webhooks/proposales ──►
     │  (external)       │         (proposal.viewed/sent/
     └───────────────────┘          signed/status_changed)
```

---

## Monorepo Structure

```
proposales-platform/
├── apps/
│   └── web/                   # Next.js 16 App (App Router)
│       ├── app/api/           # All API route handlers
│       │   ├── ai/            # chat streaming + conversations
│       │   ├── activity-feed/ # SSE stream + polling endpoint
│       │   ├── webhooks/      # External Proposales webhook receiver
│       │   ├── proposales/    # Proxy routes (proposals, companies, content…)
│       │   ├── mock-pms/      # Mock PMS (venue, availability, booking)
│       │   ├── my-proposals/  # Guest proposal list
│       │   └── auth/          # NextAuth.js + passkey auth
│       ├── app/dashboard/     # All dashboard pages
│       └── lib/               # redis, mongodb, auth, hooks, chat-store…
├── packages/
│   ├── api-client/            # Typed Proposales API client + Zod validation
│   ├── ui/                    # Shared UI components (shadcn-inspired)
│   ├── ai/                    # AI tools, prompts, tool registry, bookSpace()
│   ├── theme/                 # Design tokens & Tailwind preset
│   └── config/                # Shared TypeScript configs
├── turbo.json                 # Turborepo pipeline config
├── vercel.json                # Vercel deployment config
└── .env.example               # Required environment variables
```

---

## Features

### Sales Dashboard
- **Dashboard** — KPIs, pipeline value, status distribution, recent proposals
- **Proposals** — Full CRUD, search, filter by status, detail view with blocks/signatures/tracking
- **Content Library** — Create, edit, delete, bulk archive, and restore reusable content blocks
- **Companies** — List companies and view their templates
- **Analytics** — Pipeline funnel, status donut chart, monthly trends, performance metrics
- **Real-Time Activity Feed** — Bell icon with unread badge; live events delivered via SSE (Server-Sent Events), seeded from Proposales webhooks and API polling

### AI Sales Assistant
- Chat interface powered by **Vercel AI SDK v6** with tool-calling (`streamText`, `gateway`)
- Role-aware: `sales` users get full tool set (create proposal, analyze pipeline, book space…); `customer` users get read-only tools
- Up to 15 tool-call steps per message turn
- Persistent multi-conversation history (stored Redis + MongoDB per user)
- Browser voice mode: speech-to-text input

### Guest Portal
- **My Proposals** page — lists all proposals for the authenticated guest
- Merges local `UserProposal` records with live Proposales API data
- Real-time updates via SSE (`/api/my-proposals/stream`) with 60-second SWR polling fallback
- Visual status tracker: Draft → Sent → Viewed → Signed (+ terminal states)

### Proposales Webhook Integration
- `POST /api/webhooks/proposales` receives **external events from the Proposales SaaS platform**
- Register your deployment URL in the Proposales dashboard → Webhook Settings
- Handles: `proposal.viewed`, `proposal.sent`, `proposal.signed`, `proposal.status_changed`
- On each event: pushes to Redis activity feed, updates `UserProposal` in MongoDB, auto-books mock PMS on acceptance
- **No internal webhooks** are used between services in this app — all cross-service calls are direct function calls

### Mock PMS (Property Management System)
- In-memory venue/space/inventory simulation
- Endpoints: `/api/mock-pms/venue`, `/api/mock-pms/availability`, `/api/mock-pms/calendar`, `/api/mock-pms/book`
- Auto-booked via webhook when a proposal is e-signed/accepted

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, RSC) |
| Language | TypeScript 5, React 19 |
| Monorepo | Turborepo |
| Styling | Tailwind CSS + custom Proposales theme |
| UI | Custom component library (`@proposales/ui`, shadcn-inspired) |
| API Client | `@proposales/api-client` — typed SDK with Zod validation |
| AI | Vercel AI SDK v6 (`ai`) — `streamText`, `gateway`, multi-step tool calls |
| AI Model | Configurable via `AI_MODEL` env var, defaults to `openai/gpt-4o` |
| Auth | Google OAuth (NextAuth.js v4) + plaintext passkeys + legacy SHA-256 API keys |
| Role System | `sales` (full tools + activity feed) vs `customer` (read-only + my proposals) |
| Cache / Pub-Sub | Redis via `ioredis` — chat cache, activity feed list + pub/sub channel |
| Database | MongoDB via Mongoose — conversations, users, proposals, PMS, email logs |
| Real-Time Push | SSE (`EventSource`) — activity feed stream for sales users |
| External Webhooks | Proposales SaaS → `POST /api/webhooks/proposales` (no signature verification) |
| Rate Limiting | Redis-based sliding window (`lib/rate-limiter.ts`) |
| Deployment | Vercel |

---

## Data Flow: Chat Conversations

```
User sends message
      │
      ▼
POST /api/ai/chat
  │  Auth + rate limit check
  │  Resolve role → select tool set
  │  Build system prompt
  │  streamText({ model: gateway(AI_MODEL), tools, stopWhen: stepCountIs(15) })
  │       │
  │       ├── onStepFinish → pushActivityFeedEvent (sales only)
  │       │               → upsert UserProposal in MongoDB
  │       │
  │       └── onFinish → saveMessages(conversationId, allMessages)
  │                           ├── MongoDB first (source of truth)
  │                           └── Redis second (cache: msgs:<id>)
  │
  └── toUIMessageStreamResponse() → browser streams tokens live
```

## Data Flow: Activity Feed

```
Source 1 — Proposales Webhooks (real-time):
  Proposales SaaS ──POST──► /api/webhooks/proposales
                              └─► pushActivityFeedEvent()
                                    ├── Redis LPUSH activity:feed
                                    ├── Redis LTRIM (keep last 200)
                                    ├── Redis PUBLISH activity:feed:events
                                    └── Redis SADD activity:feed:seen (dedup)

Source 2 — Background API Sync (once/min):
  GET /api/activity-feed
    └─► refreshFromProposals() [background, debounced 60s]
          └─► sdk.proposals.searchAll() → pushIfNew() for each event type

Delivery to browser:
  GET /api/activity-feed/stream (SSE)
    └─► Redis SUBSCRIBE activity:feed:events
          └─► event: activity\ndata:{...} → EventSource in layout.tsx
                └─► mutateActivityRef(prev => prepend) [no revalidate]
```

---

## Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 10
- Redis instance (`redis://...` URL)
- MongoDB instance (`mongodb://...` URI)

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
- `PROPOSALES_API_URL` — Proposales API base URL (e.g. `https://api.proposales.com`)
- `PROPOSALES_API_TOKEN` — Proposales API bearer token
- `PROPOSALES_INBOX_TOKEN` — Token for guest inbox e-sign email links
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials (see below)
- `NEXTAUTH_SECRET` — Random secret for NextAuth.js JWT encryption
- `NEXTAUTH_URL` — Your app URL (`http://localhost:3000` for local dev)
- `ALLOWED_EMAILS` — (Optional) Comma-separated emails allowed to sign in via Google
- `ALLOWED_DOMAINS` — (Optional) Comma-separated domains allowed (e.g. `yourcompany.com`)
- `SALES_EMAILS` — Comma-separated emails that get the `sales` role on Google sign-in
- `SALES_PASSKEY_1` — Plaintext passkey that grants `sales` role (direct login)
- `USER_PASSKEY_1` — Plaintext passkey that grants `customer` role (direct login)
- `AUTHORIZED_KEYS` — (Legacy) Comma-separated SHA-256 hashes of authorized API keys
- `REDIS_URL` — Redis connection URL (`redis://localhost:6379` or managed Redis)
- `MONGODB_URI` — MongoDB connection URI (`mongodb://localhost:27017/proposales`)
- `OPENAI_API_KEY` — OpenAI API key (used when `AI_MODEL` starts with `openai/`)
- `AI_MODEL` — (Optional) AI model string, defaults to `openai/gpt-4o`

**Generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

**To generate an API key hash (legacy):**
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
> **Role assignment**: Add a user's email to `SALES_EMAILS` to grant them the `sales` role on Google sign-in. All other authenticated users receive the `customer` role.

### Webhook Setup (Proposales SaaS)

To receive real-time proposal events from the Proposales platform:

1. Deploy the app so it has a public URL
2. In the Proposales dashboard → **Settings → Webhooks**, add:
   - URL: `https://your-domain.com/api/webhooks/proposales`
   - Events: `proposal.viewed`, `proposal.sent`, `proposal.signed`, `proposal.status_changed`
3. The endpoint accepts any POST — there is currently no HMAC signature verification

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

- **Authentication**: Three auth methods — Google OAuth (NextAuth.js), plaintext passkeys (`SALES_PASSKEY_1` / `USER_PASSKEY_1`), and legacy SHA-256 API key hashes (`AUTHORIZED_KEYS`)
- **Session**: JWT-based (Google OAuth) + httpOnly, secure, sameSite=strict cookies (passkey/API key)
- **Access Control**: Optional email/domain whitelisting for Google sign-in; role (`sales`/`customer`) enforced server-side on every API route
- **Rate Limiting**: Redis sliding-window rate limiter (60 req/min API, 20 req/min AI)
- **Conversation Persistence**: Redis cache + MongoDB source-of-truth — scoped per authenticated user ID
- **API Proxy**: All Proposales API calls proxied through the server — token never exposed to the browser
- **CSP Headers**: Strict Content-Security-Policy applied to all routes
- **Input Validation**: Zod schemas validate all API inputs server-side
- **Timing-Safe Comparison**: API key hash comparison uses `crypto.timingSafeEqual` to prevent timing attacks
- **Webhook Security Note**: `POST /api/webhooks/proposales` has no HMAC signature verification — consider adding one if the endpoint is internet-facing in production

## License

Private — All rights reserved.
