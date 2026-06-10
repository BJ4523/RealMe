# Fast listing onboarding: Zillow import + manual upload, MLS removal, cinematic quality fix

**Date:** 2026-06-10
**Branch:** `feature/zillow-import-remove-mls`
**Status:** Approved design — ready for implementation plan

## Goal

Let a real-estate agent onboard fast: paste a listing link (Zillow/Redfin/Realtor) **or** drag in
photos, then generate a walkthrough video. Remove the half-built MLS integration (deferred to a later
stage) so the product surface is focused. Fix the quality drop on stored cinematic videos.

Three independent workstreams, deliverable in any order:

1. Listing photo import — Firecrawl-powered URL pull + manual upload fallback.
2. Full MLS removal, including a destructive DB migration.
3. Cinematic video quality fix (ffmpeg re-encode settings).

---

## Part 1 — Listing photo import

### 1A. URL import (Zillow / Redfin / Realtor)

The pipeline already exists end-to-end:
`components/listings/url-import.tsx` → `importFromUrl()` (`app/(app)/listings/actions.ts:122`)
→ `getListingProvider("url_scrape")` → `lib/listings/url-scrape-provider.ts`
→ `scrapeListingViaFirecrawl()` (`lib/listings/firecrawl.ts`).

The provider tries **Firecrawl first** (gets past Zillow's bot wall and returns structured `photos[]`),
then falls back to a plain `fetch` + JSON-LD/OpenGraph scrape. The fallback is what runs today because
**`FIRECRAWL_API_KEY` is unset**, and Zillow blocks the plain fetch — so today a Zillow paste returns at
best a single `og:image`, not the full photo set.

**Work:**

- Add `FIRECRAWL_API_KEY` to `.env.local` (free key from <https://firecrawl.dev>). Code already reads it
  via `lib/env.ts:23` (`firecrawlApiKey`). No code change to read the key.
- Update copy in `components/listings/url-import.tsx`: label/placeholder to read
  "Paste a Zillow, Redfin, or Realtor.com link." Keep the existing "Import listing" button.
- When the scrape yields nothing (no key, or a blocked/empty page), `importFromUrl()` already returns an
  error string. Update that copy to explicitly point the agent at the new manual uploader (Part 1B):
  e.g. "Couldn't read that link — add photos manually below."
- No change needed for HeyGen fetching scraped photos: Zillow CDN URLs (`photos.zillowstatic.com`) are
  hotlink-friendly and are passed to HeyGen as-is at generation time, exactly as today.

### 1B. Manual photo upload

A drag-drop uploader that writes to the existing private `listing-photos` Supabase Storage bucket.

**Bucket becomes public-read.** New migration flips `listing-photos` to `public = true` while keeping
the existing owner-scoped INSERT/UPDATE/DELETE RLS policies (writes stay restricted to
`<uid>/...` paths). Rationale: listing photos are public marketing assets already (they live on Zillow);
a public read URL means an uploaded photo behaves **identically** to a scraped external URL — it renders
in the browser via a normal `<img src>` and HeyGen can fetch it at generation time, with **zero
signed-URL plumbing** anywhere downstream. This is the deciding simplification.

**New component:** `components/listings/photo-uploader.tsx` (client component).

- Multi-file drag-and-drop + file picker, image files only.
- Uploads each file with the **browser** Supabase client (`lib/supabase/client.ts`) directly to
  `listing-photos/<uid>/<listingId-or-temp-uuid>/<filename>`. Owner-scoped path satisfies the write RLS
  policy; no large file passes through a server action.
- After upload, resolves each object's **public URL** (`supabase.storage.from(...).getPublicUrl(...)`)
  and surfaces it to the parent form.
- Shows thumbnails of uploaded photos; allows removing a photo before save.

**Form integration:** `components/listings/listing-form.tsx` currently has a "Photo URLs (one per line)"
textarea bound to a `photos` field. The uploader's resulting public URLs merge into that same `photos`
value (uploaded URLs + any pasted URLs) so `createListing()` (`actions.ts:85`) stores them unchanged in
the `listings.photos` JSONB. **No change to the `listings.photos` schema or the
`{ url, caption?, order }` shape.** The merge happens client-side before submit.

### Data flow (unchanged downstream)

`listings.photos` JSONB (array of `{ url, order }` with public http URLs)
→ `listingPhotos()` (`lib/format.ts`) sorts/filters
→ video generation (`app/(app)/videos/actions.ts`) maps to `photoUrls`
→ HeyGen presenter (`lib/heygen/video.ts`) or cinematic (`lib/heygen/cinematic.ts`).

Because every photo URL is a public http URL (scraped CDN or public bucket), nothing downstream changes.

---

## Part 2 — Full MLS removal

### Delete entirely (MLS-only)

- `lib/listings/simplyrets-provider.ts`
- `app/(app)/settings/connections/page.tsx` (and the route)
- `docs/mls-listings.md`

### Surgical edits

- `lib/listings/index.ts` — remove `simplyRetsProvider` import + registration; clean the
  `reso`/`mlsgrid` comment.
- `lib/listings/provider.ts` — remove `"simplyrets" | "reso" | "mlsgrid"` from the `ProviderId` union;
  update the doc comment. Keep the generic `agentMlsId?` filter field (not MLS-only) but de-emphasize it
  in comments, or remove it if unused after the simplyrets deletion — confirm during implementation.
- `app/(app)/settings/actions.ts` — delete `saveMlsConnection()` and `syncListings()`; remove the
  `mls_agent_id` write inside `updateProfile()`.
- `app/(app)/settings/page.tsx` — remove the "MLS connection" link tile.
- `components/settings/profile-form.tsx` — remove the "MLS agent ID" field block.
- `lib/types/database.ts` — remove the `mls_connections` table types, the `listings.connection_id`
  relationship, and `mls_agent_id` from `profiles` Row/Insert/Update. Leave the enum union values
  (`simplyrets`/`reso`/`mlsgrid`) — see migration note.
- Docs scrub: `README.md`, `CLAUDE.md`, `AGENTS.md`, `PRD_STATUS.md`, `docs/architecture.md`,
  `docs/production.md`, `docs/README.md` — remove MLS / SimplyRETS / RESO / `mls_connections` /
  `mls_agent_id` references.

### Migration

`supabase migration new remove_mls`:

- `DROP TABLE IF EXISTS public.mls_connections CASCADE;` (also drops its policies/trigger/index).
- `ALTER TABLE public.listings DROP COLUMN IF EXISTS connection_id;`
- `ALTER TABLE public.profiles DROP COLUMN IF EXISTS mls_agent_id;`
- **Enum values left in place.** Postgres has no clean `ALTER TYPE ... DROP VALUE`; the unused
  `simplyrets`/`reso`/`mlsgrid` values on `connection_provider` / `listing_source` are harmless. Add a
  SQL comment explaining this.

This is a destructive migration; it runs against the cloud project on the next `supabase db push`. The
repo's CLAUDE.md notes local dev currently points at the cloud Supabase, so apply with care and confirm
the project ref (`srigrlqyzpfjuahmqdag`) first.

---

## Part 3 — Cinematic video quality fix

### Root cause

`lib/video/stitch.ts:43-66` re-encodes the concatenated clips with `-preset veryfast` and **no `-crf`**
(libx264 then defaults to a lossy CRF). The HeyGen source clips look great; this pass is where quality is
lost. Presenter videos are unaffected — they store HeyGen's URL directly with no re-encode
(`app/api/webhooks/heygen/route.ts`).

### Fix (ffmpeg args in `stitchClipsWithNarration`)

- Quality: `-crf 18 -preset medium` (visually near-lossless; `medium` on ~2×10s 720p clips is a few
  seconds, well within the 300s function budget).
- Normalize each input in `filter_complex` before concat:
  `scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`
  per input, then `concat=n=N:v=1:a=0[v]`. This preserves resolution **and** makes concat robust — the
  current bare concat filter errors if clip dimensions/SAR differ (despite the code comment claiming
  robustness).
- Audio: `-b:a 192k`. Keep `-pix_fmt yuv420p`, `-shortest`, `-movflags +faststart`.

### Verification

- Run `scripts/stitch-smoke.mjs` (exercises the bundled static ffmpeg on macOS) and confirm a clean
  encode + sane output size.
- If a perceptible drop remains after this fix, the next suspect is HeyGen's per-clip render resolution
  (a parameter in `lib/heygen/cinematic.ts`); investigate as a follow-up, out of scope here.

---

## Out of scope / non-goals

- No MLS aggregator work (deferred). No re-creation of the dropped DB objects.
- No change to presenter-mode video or HeyGen render params (Part 3 is the stitch re-encode only).
- No change to the `listings.photos` JSONB shape.
- No signed-URL infrastructure (the public-bucket decision removes the need).

## Risks

- **Public listing-photos bucket** exposes uploaded photos to anyone with the URL. Acceptable: these are
  public marketing assets. Documented here as an explicit tradeoff.
- **Firecrawl dependency / cost** for Zillow imports. Mitigated by the manual-upload fallback, which has
  no external dependency.
- **Destructive migration** — irreversible drop of `mls_connections` and two columns. Mitigated by the
  fact the data is unused stub data; confirm the Supabase project ref before pushing.
