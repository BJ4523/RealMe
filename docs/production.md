# Going to production

The app ships mock-first. Here's the checklist to make it real.

## Investor demo (no MLS required)

The fastest credible demo needs **no MLS integration and no seed data** — the live flow is the
pitch:

1. Set `HEYGEN_MOCK=0` + `HEYGEN_API_KEY` (and `ANTHROPIC_API_KEY` for sharper scripts).
2. Sign up → on onboarding, **upload your photo** (avatar) and **a ~30s voice clip** (cloned
   voice). Both are real HeyGen calls.
3. Add a listing via **manual entry** or **paste-a-URL** (no MLS).
4. Hit **Generate** → review the AI script → **Generate video** → a real avatar video in your
   voice, narrating the listing.
5. Pre-generate one video beforehand so a slow render can't bite you on stage. Keep the
   **Connect MLS** tile visible (it reads *Coming soon*) — that's the scale story, not a demo
   dependency.

Verify the HeyGen endpoints with your key first (see [heygen.md](./heygen.md)).

## 1. HeyGen (avatar + video)

- Set `HEYGEN_MOCK=0` and `HEYGEN_API_KEY`.
- **Verify the endpoints** in [`lib/heygen/client.ts`](../lib/heygen/client.ts) against live docs
  — HeyGen is mid v2→v3 migration and the request/response shapes need pinning. See
  [heygen.md](./heygen.md). Hit each endpoint once with a real key before trusting the flow.
- Set `HEYGEN_WEBHOOK_SECRET` and ensure `NEXT_PUBLIC_SITE_URL` is your real domain so the
  callback URL (`<site>/api/webhooks/heygen?secret=…`) resolves from HeyGen's servers.
- Optionally build a HeyGen **template** for branded multi-photo layouts and wire it into
  `lib/heygen/video.ts`.

## 2. Claude (script generation)

- Set `ANTHROPIC_API_KEY`. Without it the app uses a deterministic templated script (fine for
  demos, weaker copy). Model is `claude-opus-4-8`; switch to `claude-haiku-4-5` in
  `lib/ai/script.ts` to cut cost on this simple structured task.

## 3. MLS listings

- Implement a concrete `ListingProvider` and register it in
  [`lib/listings/index.ts`](../lib/listings/index.ts). **SimplyRETS** is the fastest path (the
  agent brings their own MLS credentials). Filter to the agent's own listings via the RESO
  `ListAgentMlsId` stored on `profiles.mls_agent_id`. Full guidance + alternatives in
  [mls-listings.md](./mls-listings.md).
- Store per-agent credentials in `mls_connections.credentials` (encrypt before storing).

## 4. Supabase (cloud)

- Create a cloud project; point `NEXT_PUBLIC_SUPABASE_URL` / keys at it.
- Push the schema: `supabase link` then `supabase db push`.
- Re-run `supabase db advisors` against the cloud project and resolve anything flagged.
- Confirm **RLS** is on for every table and the storage bucket policies match (private buckets,
  owner-prefixed paths). Service-role key stays server-side only.
- Configure SMTP and email-confirmation settings (local dev has confirmations off).

## 5. Vercel

- Set all env vars in the project (Production + Preview). On Preview, set `NEXT_PUBLIC_SITE_URL`
  to the preview URL so webhooks resolve there too.
- The `vercel.json` cron runs `/api/cron/reconcile-videos` every 2 minutes to self-heal jobs that
  miss their webhook. Vercel cron fires on Production by default — test on Preview by calling the
  route manually with the `CRON_SECRET`.
- Storage: large avatar/video assets live in Supabase Storage; consider mirroring finished videos
  to a `video-cache` bucket (bucket + read policy already provisioned) and serving via signed URLs
  so shares can be revoked.

## 6. Hardening before scale

- **Usage guards** — per-agent caps on video generation (HeyGen credits cost real money).
- **Listing-photo mirroring** — copy imported photos into the `listing-photos` bucket so HeyGen
  and the player don't depend on third-party hosts.
- **Webhook signature** — when HeyGen provides a signing secret, verify the signature in the
  webhook route in addition to the shared-secret query param.
- **Rate limiting / WAF** — protect `/api/*` (Vercel Firewall or middleware).
- **Observability** — log job transitions and webhook receipts; alert on jobs stuck in
  `processing`.

## Pre-launch smoke checklist

- [ ] Signup creates a `profiles` row (trigger)
- [ ] Onboarding gate redirects until an avatar exists
- [ ] Avatar reaches `ready`
- [ ] Manual + URL listings persist
- [ ] Script returns valid structured output
- [ ] Video submits, webhook/cron drives it to `completed`
- [ ] Download + share links work and are owner-scoped
- [ ] Two users cannot see each other's data (RLS)
