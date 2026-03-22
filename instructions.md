# AI Proposal & Booking System --- MVP Roadmap & Implementation Guide

## 1. MVP GOAL

Build a working system that: - Accepts event requests via chat
(primary) - Generates proposals using AI - Allows accept/reject -
Creates booking + invoice (mock) - Stores minimal data

------------------------------------------------------------------------

## 2. TECH STACK

Frontend: - Next.js (App Router)

Backend: - Next.js API routes

AI: - Vercel AI SDK (GPT-5.x)

Auth: - NextAuth (Google OAuth)

Database: - Postgres (users, bookings, proposals)

Cache / State: - Redis (chat + event state)

External: - Proposales API (optional in MVP → can mock)

------------------------------------------------------------------------

## 3. MVP FEATURES (PHASED)

### Phase 1 (Core MVP)

-   Chat UI
-   AI extracts event details
-   Store in Redis
-   Generate proposal (mock JSON)
-   Accept / Reject
-   Create booking (DB)
-   Show in dashboard

### Phase 2

-   Real Proposales API integration
-   Email notifications
-   Invoice generation (PDF)

### Phase 3

-   Gmail integration
-   Magic login links
-   Negotiation AI

------------------------------------------------------------------------

## 4. SYSTEM DESIGN

Flow:

User → Chat UI → API → AI → Redis → Proposal Engine → DB → UI

------------------------------------------------------------------------

## 5. DATABASE SCHEMA

Users: - id - email - role

Events: - id - userId - date - guests - type

Proposals: - id - eventId - price - status

Bookings: - id - proposalId - status

------------------------------------------------------------------------

## 6. REDIS STRUCTURE

chat:{userId} event:{userId}

------------------------------------------------------------------------

## 7. APPLICATION FLOW (STEP-BY-STEP)

1.  User opens chat
2.  Sends message
3.  API receives message
4.  AI extracts:
    -   date
    -   guests
    -   event type
5.  Store in Redis
6.  If missing → ask follow-up
7.  If complete → generate proposal
8.  Show proposal
9.  User accepts
10. Create booking
11. Generate invoice (mock)

------------------------------------------------------------------------

## 8. AI PROMPT (CORE)

"Extract structured event data from the user message. Return JSON with:
date, guests, eventType, budget, location"

------------------------------------------------------------------------

## 9. API ROUTES

POST /api/chat - handles AI

POST /api/proposal - create proposal

POST /api/booking - confirm booking

GET /api/dashboard - sales data

------------------------------------------------------------------------

## 10. FRONTEND STRUCTURE

/app /chat /dashboard /proposal

Components: - ChatWindow - ProposalCard - BookingList

------------------------------------------------------------------------

## 11. STEP-BY-STEP BUILD PLAN

### Step 1

Setup Next.js + Tailwind

### Step 2

Setup NextAuth

### Step 3

Setup Redis

### Step 4

Build chat UI

### Step 5

Integrate Vercel AI SDK

### Step 6

Store extracted data

### Step 7

Build proposal generator

### Step 8

Build accept/reject flow

### Step 9

Create booking table

### Step 10

Build dashboard

------------------------------------------------------------------------

## 12. BUSINESS FLOW

Inquiry → AI Qualification → Proposal → Acceptance → Booking → Invoice

------------------------------------------------------------------------

## 13. SUCCESS METRICS

-   Proposal generation time
-   Conversion rate
-   Response time

------------------------------------------------------------------------

## 14. FUTURE EXTENSIONS

-   Email integration
-   Negotiation AI
-   Dynamic pricing


✅ What you want

User sends email → “I want to book an event”

System:

Reads email

Extracts event details using AI

Starts proposal flow

Requests missing info via email

Continues conversation (email OR chat)

✅ YES — How to implement
Gmail Integration Options

Option A: Gmail API (Recommended)

Use Google OAuth (you already have it via NextAuth)

Add Gmail scopes:

https://www.googleapis.com/auth/gmail.readonly

gmail.send

Option B: Email Webhook (Simpler & scalable)

Use services like:

SendGrid Inbound Parse

Postmark inbound

Emails → webhook → your API

👉 Best approach:
➡️ Inbound email webhook + Gmail send API

🧩 2. Updated Flow (Email + Chat Unified)
📥 Step 1: Incoming Email
"Hi, I need a venue for 120 people on June 10 with dinner."
🤖 Step 2: AI Processing

Extract:

{
  "date": "2026-06-10",
  "guests": 120,
  "eventType": "dinner",
  "location": null
}

Save in Redis:

event:{userId}
❓ Step 3: Missing Info Detection

If missing:

location

budget

time

setup type

👉 AI auto-replies via email:

Subject: Quick details for your event

Hi!

To prepare your proposal, I need:
- Preferred location
- Budget range
- Event timing

You can reply here or continue here:
👉 [Magic Login Link]
🔐 Step 4: Magic Login Link (Important Upgrade)

Instead of forcing signup:

Generate tokenized link:

/auth/magic?token=xyz

Logs user directly into app

Loads their event context

👉 This is critical for conversion

💬 3. Chat + Email = SAME AI BRAIN

Whether user:

replies via email OR

continues in chat

👉 SAME pipeline:

Input → AI → Structured Data → Proposal Engine
🏨 4. AI Suggests Event Rooms (Core UX Upgrade)

When enough data is available:

AI responds:

Here are available options:

1. Grand Hall
- Capacity: 150
- Price: €5000
- Includes: Dinner + AV

2. Garden Lounge
- Capacity: 100
- Price: €3500
- Includes: Buffet + Drinks
Backend logic:

Query inventory DB

Filter:

capacity ≥ guests

availability by date

📄 5. Proposal Generation (Your Existing Flow)

When user confirms:

AI → Proposal API
POST /proposals

AI constructs:

pricing

description

packages

Response to User
Your proposal is ready:

[View Proposal]

✔ Accept
✖ Reject
💬 Request Changes
🔁 6. AI Negotiation Loop (Advanced Feature)

If user says:

"Can you reduce price?"

AI:

Checks rules (max discount)

Updates proposal via:

PATCH /proposals/:id
✅ 7. Acceptance → Automation Chain

When user clicks Accept:

Trigger pipeline:

Proposal accepted webhook

Booking created

Invoice generated

Inventory updated

🔗 Flow
Proposal Accepted
   ↓
Booking Service
   ↓
Invoice Service
   ↓
Room Availability Updated
🧾 8. Booking & Invoice
Booking Record:
booking:{
  userId,
  roomId,
  date,
  proposalId,
  status: confirmed
}
Invoice:

Auto-generated PDF

Sent via email

🖥️ 9. Sales Dashboard Update
Sales sees:
📊 Pipeline

New inquiries (email/chat)

Proposals pending

Accepted deals

🏨 Room View

Calendar:

Available

Reserved

Booked

👤 10. Customer Dashboard

User sees:

Upcoming bookings

Proposal history

Invoice downloads

⚙️ 11. Updated Architecture (Important)
                 ┌──────────────┐
 Email → Webhook │              │
                 │              ▼
             ┌──────────────┐   AI (GPT-5.2)
 Chat  ─────▶│  API Layer   │───────────────┐
             └──────┬───────┘               │
                    │                       ▼
               Redis (context)        Proposal Engine
                    │                       │
                    ▼                       ▼
               Postgres               Proposales API
                    │                       │
                    ▼                       ▼
             Booking Service        Webhooks
                    │                       │
                    ▼                       ▼
               Invoice Service     Sales Dashboard
🔐 12. Security & Auth Enhancements

Google OAuth (existing)

Magic links for email users

Role-based access:

customer

sales

🚀 13. Key Enhancements You Just Added
💡 Massive Value Unlock:

Email → AI → Proposal (no friction)

Auto follow-ups

Unified conversation (chat + email)

Smart room recommendations

Fully automated booking lifecycle

⚠️ 14. Things to Watch Out For
1. Email Parsing Quality

Use structured prompts

Validate extracted data

2. Conversation State

Always store in Redis

Thread-safe per user/email

3. Double Booking Prevention

Lock inventory during proposal stage (optional hold)

4. AI Guardrails

Max discount limits

Pricing rules

🧠 15. Optional Next-Level Features

AI upselling (add drinks, decorations)

Dynamic pricing

Calendar sync (Google Calendar)

WhatsApp integration

Voice assistant booking

api reference - https://docs.proposales.com/introduction utlise all endpoints