# Fast listing onboarding — setup & go-live checklist

This branch (`feature/zillow-import-remove-mls`) ships three changes. Most of it works
out of the box; the only **new external dependency** is a Firecrawl API key for Zillow URL
import. Everything below is what's needed to run it end-to-end.

## What shipped

1. **Fast photo onboarding** — agents paste a Zillow/Redfin/Realtor link (Firecrawl-powered)
   *or* drag-drop photos into the listing form. Uploaded photos go to a now-public
   `listing-photos` bucket and behave exactly like scraped URLs.
2. **MLS integration removed** — the deferred SimplyRETS/RESO stub, the `/settings/connections`
   page, the `mls_connections` table, and the `profiles.mls_agent_id` column are gone.
3. **Cinematic video quality fix** — the ffmpeg stitch now re-encodes at `-crf 18 -preset medium`
   (was `veryfast`/no-CRF) and normalizes clips to 720×1280/30fps, so stored cinematic videos
   match the HeyGen source quality.

## ✅ Already done

- **DB migrations applied to the cloud project** `srigrlqyzpfjuahmqdag` ("BJ4523's Project")
  via `supabase db push` on 2026-06-10. Remote migration history is in sync:
  - `20260610163229_remove_mls` — dropped `mls_connections`, `listings.connection_id`,
    `profiles.mls_agent_id`.
  - `20260610164200_listing_photos_public` — set the `listing-photos` bucket to public-read.
- Production build is green (`npm run build` exit 0). Lint shows only pre-existing issues.

## 🔑 Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Production/Preview) and in
local `.env.local`. `.env*` is gitignored — never commit real keys.

| Var | Needed for | Status / action |
|---|---|---|
| `FIRECRAWL_API_KEY` | **NEW.** Zillow/Redfin/Realtor URL import returning full photo sets. Without it, those sites block the plain-fetch fallback and agents must use drag-drop upload. | **Action:** create a free key at [firecrawl.dev](https://firecrawl.dev) and set it. |
| `HEYGEN_MOCK` | `1` = fake ids + sample MP4 (no keys). `0` = real avatars/videos. | Set `0` in prod to generate real videos. |
| `HEYGEN_API_KEY` | Real avatar + video generation (presenter & cinematic). | Required when `HEYGEN_MOCK=0`. |
| `HEYGEN_WEBHOOK_SECRET` | Shared-secret query param on the HeyGen → app webhook. | Set if using webhooks for video completion. |
| `HEYGEN_DEFAULT_VOICE_ID` | Stock voice when an agent hasn't cloned one. | Any id from HeyGen `GET /v2/voices`. |
| `ANTHROPIC_API_KEY` | Claude-written walkthrough scripts. Falls back to a template when unset + mock. | Set for real script quality. |
| `NEXT_PUBLIC_SUPABASE_URL` | App → Supabase. | Already set (→ `srigrlqyzpfjuahmqdag`). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser Supabase client (incl. the new photo uploader). | Already set. |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhooks/cron/admin (RLS bypass). Server-only. | Already set. |
| `NEXT_PUBLIC_SITE_URL` | HeyGen webhook callback + share links. | Set to the prod URL in prod. |
| `CRON_SECRET` | Guards the `/api/cron/reconcile-videos` endpoint. | Set a strong value in prod. |
| `RESEND_API_KEY` | Supabase Auth SMTP (magic links). | Set if not already. |
| `ADMIN_EMAILS` | Access to `/admin` routes. | Comma-separated emails. |

The photo uploader itself needs **no new keys** — it uses the existing browser Supabase client
and the public bucket.

## 🧪 Manual verification (Task C5 — do once against a running app)

Run `npm run dev` (or hit the Preview deploy) and check:

1. **Drag-drop upload:** Add a listing → Manual entry → drag 2–3 photos onto the uploader →
   thumbnails appear, the textarea fills with `…/storage/v1/object/public/listing-photos/…` URLs →
   Save → listing detail shows the photos. Open one photo URL in a fresh incognito tab to confirm
   public-read works (no auth).
2. **Zillow import** (needs `FIRECRAWL_API_KEY`): Add a listing → Import from URL → paste a Zillow
   `homedetails` link → address + photos populate → Save.
3. **Fallback copy:** With no key (or a blocked page), the import error should steer you to
   Manual entry + drag-drop.
4. **Cinematic quality:** Generate a cinematic video (requires a consent-verified twin and
   `HEYGEN_MOCK=0`) and confirm the stored result is sharp — visually matching the HeyGen clips.
5. **MLS gone:** `/settings` has no "MLS connection" tile; `/settings/connections` 404s; the
   profile form has no MLS agent-ID field; the listings page has no "Connect MLS" button.

## 🔒 Security note — public `listing-photos` bucket

The bucket is now public-read so uploaded photos work in a plain `<img>` and can be fetched by
HeyGen. **Writes stay owner-restricted** via the existing RLS policies (`<uid>/...` paths). Anyone
with a photo's URL can view it — acceptable because listing photos are public marketing assets, but
do not store anything sensitive in this bucket. (Documented inline in the public-bucket migration.)

## 📌 Notes

- **Cinematic still requires HeyGen twin consent** (`consent_status: validated`) — unchanged by this
  branch; cleared via the hosted recorder on `/settings/avatar`.
- **Cinematic encode time:** `-preset medium` on the capped ≤2 short clips stays well under the
  300s function budget. If the shot cap is ever raised substantially, re-check encode latency.
