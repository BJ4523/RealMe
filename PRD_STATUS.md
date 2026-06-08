# RealMe — PRD & Status

_Last updated: 2026-06-06_

**Live (production):** https://realme-kappa.vercel.app
**Repo:** github.com/BJ4523/RealMe (branch `app-scaffold`, PR #1)
**Stack:** Next.js 16 (App Router, TS) · Supabase (cloud dev project `srigrlqyzpfjuahmqdag`) · HeyGen · Tailwind/shadcn + ported design · Vercel

---

## 1. Product (PRD summary)

RealMe is an AI marketing platform for real estate agents. The agent creates a
talking **avatar** of themselves (photo + voice), connects/imports their
**listings**, and the app auto-generates personalized **walkthrough videos**
("reels") where the avatar narrates each property — then schedules and
cross-posts them, captures leads, and powers a public **RealMe LIVE** listing
site where every unit comes with the agent on camera. Sales **and** rentals
(property-manager) modes.

Core pillars:
1. **Avatar** — one photo + voice clip → on-camera talking avatar.
2. **Listings** — connect MLS / import so the agent's real inventory is in the app.
3. **Video Studio** — pick a listing + template → AI script → rendered video.
4. **Distribution** — schedule, cross-post to IG/TikTok/YT/LinkedIn, email blasts.
5. **Leads / CRM** — capture and nurture leads from reels and the public site.
6. **RealMe LIVE** — consumer site of listings, each with an agent reel.

---

## 2. Status at a glance

| Area | Status |
|---|---|
| Design (landing, dashboard, LIVE) implemented + mobile-responsive | ✅ Done |
| Magic-link auth (Supabase) | ✅ Done |
| Cloud Supabase project wired (schema, RLS, redirect URLs) | ✅ Done |
| Vercel deploy + all env vars | ✅ Done |
| Avatar creation (real HeyGen, photo + voice clone) | ✅ Done |
| Listings: manual + URL import (real data) | ✅ Done |
| Video Studio → **real** HeyGen video generation | ✅ Done |
| Custom email delivery (Resend SMTP) | ⏳ Blocked on Resend API key |
| MLS connection (real aggregator/RESO feed) | ❌ Not started (stubs only) |
| Distribution: scheduling + social cross-posting | ❌ Design only (demo) |
| Email campaigns (send) | ❌ Design only (demo) |
| Leads / CRM (persisted) | ❌ Design only (demo) |
| RealMe LIVE backed by real listings | ❌ Design only (demo) |
| Rentals mode backed by real data | ❌ Design only (demo) |

---

## 3. Done — detail

### Foundation & infra
- [x] Next.js 16 app, design system (cream/lime/ink, Bricolage/Geist/JetBrains).
- [x] Supabase schema: `profiles, avatars, mls_connections, listings, videos` with **RLS on every table**, storage buckets, `handle_new_user` trigger. Pushed to cloud project `srigrlqyzpfjuahmqdag` (verified Local == Remote).
- [x] **Magic-link auth** (`signInWithOtp` → `/auth/callback`); cloud Site URL + redirect allow-list set to the Vercel domain.
- [x] Deployed to Vercel with env vars: Supabase URL/publishable/service-role, HeyGen key + default voice, `HEYGEN_MOCK=0`, webhook/cron secrets, site URL.
- [x] Verified end-to-end (local + deployed): pages render, auth gate works, cloud Supabase connected.

### Design (all three surfaces, mobile-responsive)
- [x] **Landing** (`/`) — hero, how-it-works, live demo, calendar, email, leads, rentals/LIVE, pricing, CTA, footer.
- [x] **Dashboard** (`/app`) — Sales/Rentals modes, sidebar, Today, Listings, Video Studio, Calendar, Email, Leads, Lease Pipeline, Syndication, Concessions.
- [x] **RealMe LIVE** (`/live`) — agents directory, unit cards with reels, filters, unit detail overlay, save.
- [x] **Mobile-responsive** via `useIsMobile()`: sidebar→top-bar, stacked grids, no 390px overflow, no console errors.

### Avatar + Video (real)
- [x] **Avatar** — upload photo (+ optional voice clip) → real HeyGen **talking photo** + **instant voice clone**; stored as the agent's active avatar.
- [x] **Video Studio** — picks the agent's **real listings**; "Generate video" runs the **real** pipeline (script → HeyGen render → poll → plays finished video in preview). Gated on having an avatar. Verified end-to-end with a real generated video.
- [x] HeyGen endpoints validated live (`/v1/talking_photo`, `/v2/video/generate`, status). Webhook (`/api/webhooks/heygen`) + daily cron reconciler.

### Listings (real)
- [x] Manual entry + paste-a-URL import behind a swappable `ListingProvider` interface.
- [x] Dashboard **Listings/Portfolio** + Studio picker render the agent's real Supabase listings (fallback to demo data for empty accounts).

---

## 4. In progress / blocked

### (a) Resend SMTP — ⏳ blocked on credential
Config is prepped (`supabase/config.toml`, password via `env(RESEND_API_KEY)`).
**To finish:** add `RESEND_API_KEY=re_...` to `.env.local`, then run the one-time
`supabase config push` (with the Vercel Site URL set). Until then, magic links use
Supabase's built-in email (rate-limited, rejects test domains).

---

## 5. What's left to fully meet the PRD

Ordered roughly by product priority.

### P0 — core loop completeness
- [ ] **Finish Resend SMTP** so magic links deliver reliably (needs key — see §4).
- [ ] **Avatar setup inside the dashboard.** Today new users hit the legacy
      `/onboarding` wizard. Build an in-dashboard "set up your avatar" step
      (photo + voice) matching the design, so the flow never leaves `/app`.
- [ ] **Persist generated videos in the dashboard.** Studio generates real
      videos, but there's no design-native "my reels" library/grid yet (the
      data exists in the `videos` table). Surface generated reels in the
      dashboard + on listing cards ("reels live" count is currently demo).

### P1 — listings at scale (MLS)
- [ ] **Real MLS connection.** Implement a concrete `ListingProvider`
      (SimplyRETS first — agent brings MLS creds; filter to their listings via
      RESO `ListAgentMlsId` on `profiles.mls_agent_id`), then aggregators
      (Trestle / MLS Grid / Realtyna). Wire the Settings → "Connect MLS" flow.
      See `docs/mls-listings.md`.
- [ ] **Listing photo handling** — mirror imported photos to Storage so HeyGen
      backgrounds and the player don't depend on third-party hosts.
- [ ] **Real Claude script generation** in the Studio (currently uses the
      template draft; `lib/ai/script.ts` + `ANTHROPIC_API_KEY` ready to swap in).

### P2 — distribution (the "be everywhere" promise)
- [ ] **Scheduling / calendar** — back the Calendar view with a real schedule
      (post times, cadence) instead of demo `POSTS_WEEK`.
- [ ] **Social cross-posting** — real integrations (IG/TikTok/YouTube/LinkedIn
      Graph/Content APIs) to publish generated reels. Currently demo chips.
- [ ] **Email campaigns** — actually send the "new listing / open house" blasts
      (the Email view is demo); reuse Resend.
- [ ] **Syndication** — real push to Zillow/Zumper/Apartments.com/etc.
      (rentals "8 ILSes" promise); currently demo.

### P3 — CRM + public site + rentals
- [ ] **Leads / CRM** — schema + persistence for leads + pipeline stages; back
      the Leads/Lease-Pipeline views (currently demo `LEADS`/`STAGES`).
- [ ] **RealMe LIVE backed by real data** — public listing site reading real
      listings + published reels; "Saved", follow-agent, lead capture.
- [ ] **Rentals mode** — real buildings/units/occupancy/concessions data model
      (currently demo `BUILDINGS`/`UNITS`).

### P4 — productionization
- [ ] **⚠️ Migrate video render off HeyGen v2 before 2026-10-31.** The
      walkthrough render uses `POST /v2/video/generate` (multi-scene + per-scene
      photo background + matted avatar) — the only way today to composite the
      avatar/twin over listing photos. HeyGen supports v2 **only through Oct 31,
      2026**. v3 (`/v3/videos`) is single-scene and won't composite a background,
      so migrate when HeyGen ships v3 multi-scene/background, or build a v3
      per-photo-clip + stitch fallback. Twin **creation** is already on v3.
      See the MIGRATION note in `lib/heygen/video.ts`.
- [ ] **Billing / plans** — pricing page is static; add Stripe + plan limits
      (HeyGen credit metering, "47/100 reels" is demo).
- [ ] **Usage guards** on video generation (HeyGen credits cost real money).
- [ ] **SMTP sender domain** verified in Resend (replace `onboarding@resend.dev`).
- [ ] **Custom domain** on Vercel (e.g. realme.live).
- [ ] **Observability** — log job transitions, alert on stuck `processing`.
- [ ] **Webhook signature verification** (beyond the shared-secret query param)
      once HeyGen provides a signing secret.

---

## 6. Known issues / tech debt
- Ported design components are `@ts-nocheck` (faithful prototype port) — typed
  data flows in at the boundaries (context, server actions) but the design
  internals aren't type-checked.
- Dashboard sections outside **Listings** and **Video Studio** still render demo
  data (Today metrics, Calendar, Email, Leads, Lease Pipeline, Syndication,
  Concessions, rentals views).
- Production is on **real HeyGen** (`HEYGEN_MOCK=0`) — sign-ups consume credits.
- Legacy Tailwind routes (`/dashboard`, `/listings`, `/videos`, `/settings`,
  `/onboarding`) coexist with the design app; some (avatar setup, listing CRUD)
  are reused, others are now superseded by `/app` and can be retired.

---

## 7. Environment / credentials reference
- **Supabase (cloud dev):** project `srigrlqyzpfjuahmqdag` ("BJ4523's Project").
  Keys/URL set in Vercel. Local stack via `supabase start` (ports `544xx`).
- **HeyGen:** key set (local + Vercel), `sk_V2_…`, ~6,000 credits. Default voice
  `HEYGEN_DEFAULT_VOICE_ID` set. Real mode on.
- **Resend:** pending key (`RESEND_API_KEY`) — see §4.
- **Anthropic:** `ANTHROPIC_API_KEY` not set (Studio uses template script until added).
- Full env list in `.env.example`; deeper docs in `docs/` (architecture, heygen,
  mls-listings, setup, production).
