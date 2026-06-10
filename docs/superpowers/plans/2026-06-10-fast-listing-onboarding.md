# Fast Listing Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let agents onboard listings fast (paste a Zillow/Redfin/Realtor link via Firecrawl, or drag-drop photos), remove the deferred MLS integration, and fix the cinematic video quality drop.

**Architecture:** Three independent workstreams. (A) Cinematic fix is a self-contained ffmpeg arg change. (B) MLS removal deletes the simplyrets provider, settings UI, DB objects, and docs. (C) Photo onboarding adds a public-read `listing-photos` bucket + a drag-drop uploader, and turns on Firecrawl for URL import. Photos always end up as plain public http URLs in `listings.photos` JSONB, so nothing downstream (HeyGen presenter/cinematic) changes.

**Tech Stack:** Next.js 16 App Router (TS), Supabase (Postgres + Storage + RLS), Firecrawl, ffmpeg-static, Tailwind/shadcn.

**Testing note:** This repo has **no unit-test runner** (see CLAUDE.md). Verification uses `npx tsc --noEmit` (typecheck), `npm run lint`, `npm run build`, the `scripts/stitch-smoke.mjs` smoke test, and manual dev-server checks. Do **not** scaffold a test framework.

**Suggested order:** Workstream A → B → C. Each task ends with a commit. Keep the build green at every commit.

---

## Workstream A — Cinematic video quality fix

### Task A1: Raise stitch encode quality + normalize clips before concat

**Files:**
- Modify: `lib/video/stitch.ts:38-66`
- Modify: `scripts/stitch-smoke.mjs:24-32` (keep the smoke test matching the real filter graph)

- [ ] **Step 1: Replace the filter graph + encode args in `lib/video/stitch.ts`**

Replace the block that builds `concat`, `outPath`, and `args` (currently lines 38-66) with:

```ts
    const n = clips.length;
    // Normalize every clip to a common 720x1280 / 30fps / square-pixel space so
    // the concat filter never errors on mismatched dimensions or SAR, then
    // concat. force_original_aspect_ratio=decrease + pad preserves the image
    // (letterboxes rather than stretching) without an upscale blur.
    const norm = clips
      .map(
        (_, i) =>
          `[${i}:v:0]scale=720:1280:force_original_aspect_ratio=decrease,` +
          `pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`,
      )
      .join(";");
    const concat =
      clips.map((_, i) => `[v${i}]`).join("") + `concat=n=${n}:v=1:a=0[v]`;
    const filter = `${norm};${concat}`;
    const outPath = join(dir, "out.mp4");

    const args = [
      "-y",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      "[v]",
      "-map",
      `${n}:a:0`,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      outPath,
    ];
```

Also update the doc comment at the top of the function (lines 8-14): change "Uses the concat *filter* (re-encode) so it's robust to minor differences between clips." to "Normalizes each clip to 720x1280/30fps, then concats and re-encodes at CRF 18 (`-preset medium`) so quality matches the HeyGen source. `-shortest` trims to narration length."

- [ ] **Step 2: Update the smoke test to use the same graph (`scripts/stitch-smoke.mjs`)**

Replace the `args` array (lines 24-32) with:

```js
  const args = [
    "-y", "-i", c0, "-i", c1, "-i", narr,
    "-filter_complex",
    "[0:v:0]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];" +
    "[1:v:0]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];" +
    "[v0][v1]concat=n=2:v=1:a=0[v]",
    "-map", "[v]", "-map", "2:a:0",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
  ];
```

- [ ] **Step 3: Run the smoke test**

Run: `node scripts/stitch-smoke.mjs`
Expected: prints `✓ stitched output: <NN> KB` and `✓ ffmpeg-static concat + audio mux works`, exit 0. The KB size should be **larger** than before (higher quality = bigger file); that's expected.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/video/stitch.ts scripts/stitch-smoke.mjs
git commit -m "Fix cinematic quality: CRF 18 + clip normalization in stitch"
```

---

## Workstream B — Remove MLS integration

### Task B1: Delete MLS provider + settings code/UI

**Files:**
- Delete: `lib/listings/simplyrets-provider.ts`
- Delete: `app/(app)/settings/connections/page.tsx` (and its now-empty `connections/` dir)
- Modify: `lib/listings/index.ts`
- Modify: `lib/listings/provider.ts`
- Modify: `app/(app)/settings/actions.ts`
- Modify: `components/settings/profile-form.tsx`
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Delete the simplyrets provider and connections page**

```bash
git rm lib/listings/simplyrets-provider.ts
git rm app/(app)/settings/connections/page.tsx
rmdir "app/(app)/settings/connections" 2>/dev/null || true
```

- [ ] **Step 2: Remove simplyrets from the provider registry — `lib/listings/index.ts`**

Replace lines 1-11 with:

```ts
import { manualProvider } from "./manual-provider";
import { urlScrapeProvider } from "./url-scrape-provider";
import type { ListingProvider, ProviderId } from "./provider";

const PROVIDERS: Record<string, ListingProvider> = {
  manual: manualProvider,
  url_scrape: urlScrapeProvider,
};
```

- [ ] **Step 3: Trim the provider interface — `lib/listings/provider.ts`**

Replace the file header comment (lines 1-5) with:

```ts
/**
 * Provider abstraction so the listing source (manual entry, URL scrape) is
 * swappable behind one interface. The UI and API routes depend only on this
 * interface — never on a concrete provider. MLS aggregators were removed; add
 * them back behind this same interface when re-enabled.
 */
```

Replace the `ProviderId` union (lines 32-37) with:

```ts
export type ProviderId = "manual" | "url_scrape";
```

Replace the `FetchListingsOptions` interface (lines 39-43) with:

```ts
export interface FetchListingsOptions {
  credentials?: Record<string, unknown>;
}
```

Update the `requiresConnection` doc comment (line 53) from "Whether this provider needs a saved mls_connection before it can sync." to "Whether this provider needs saved credentials before it can sync.", and the `fetchListings` comment (line 55) from "Pull all of an agent's listings (aggregators filter by agentMlsId)." to "Pull all listings this provider can resolve (manual/url return none)."

- [ ] **Step 4: Strip MLS from settings actions — `app/(app)/settings/actions.ts`**

Replace the **entire file** with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export type SettingsState = { error?: string; ok?: boolean } | undefined;

export async function updateProfile(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: (formData.get("fullName") as string) || null,
      brokerage: (formData.get("brokerage") as string) || null,
      phone: (formData.get("phone") as string) || null,
    })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
```

(This removes `saveMlsConnection`, `syncListings`, the `mls_agent_id` write, and the now-unused `getListingProvider` / `Json` imports.)

- [ ] **Step 5: Remove the MLS agent ID field — `components/settings/profile-form.tsx`**

Delete the entire `mlsAgentId` field block (lines 56-64):

```tsx
      <div className="grid gap-2">
        <Label htmlFor="mlsAgentId">MLS agent ID</Label>
        <Input
          id="mlsAgentId"
          name="mlsAgentId"
          defaultValue={profile?.mls_agent_id ?? ""}
          placeholder="Used to pull only your listings (RESO ListAgentMlsId)"
        />
      </div>
```

- [ ] **Step 6: Remove the MLS connection link tile — `app/(app)/settings/page.tsx`**

Delete the `<Link href="/settings/connections" …>` block (lines 22-27) and remove `Link2` from the lucide import on line 2 (leave `UserRound`):

```tsx
import { UserRound } from "lucide-react";
```

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (At this point code no longer references `mls_connections`, `mls_agent_id`, `simplyrets`, or `getListingProvider` in settings — but `database.ts` still defines those types; that's fine, unused types don't break the build. They're removed in B2.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Remove MLS provider, connections page, and settings hooks"
```

### Task B2: Remove MLS types from the generated DB types

**Files:**
- Modify: `lib/types/database.ts`

- [ ] **Step 1: Remove the `connection_id` column from the `listings` table type**

Delete these three lines (at `database.ts:96`, `:121`, `:146` — one in Row, Insert, Update):

```ts
          connection_id: string | null
```
```ts
          connection_id?: string | null
```
```ts
          connection_id?: string | null
```

- [ ] **Step 2: Remove the `listings → mls_connections` relationship**

Delete the relationship object in the `listings` table `Relationships` array (lines 167-172):

```ts
          {
            foreignKeyName: "listings_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "mls_connections"
            referencedColumns: ["id"]
          },
```

- [ ] **Step 3: Remove the entire `mls_connections` table type**

Delete the whole `mls_connections: { … }` block (starts at line 183, ends after its `Relationships` closes — through the closing `}` of that table object, around line 222). After deletion, the table directly before `profiles` should close cleanly and `profiles: {` follows.

- [ ] **Step 4: Remove `mls_agent_id` from `profiles`**

Delete the three `mls_agent_id` lines (at `:232`, `:244`, `:256` — Row, Insert, Update):

```ts
          mls_agent_id: string | null
```
```ts
          mls_agent_id?: string | null
```
```ts
          mls_agent_id?: string | null
```

- [ ] **Step 5: Leave enum unions as-is**

Do **not** touch the `connection_provider` / `listing_source` enum unions (lines ~354-358) or the `Constants` arrays (lines ~501-506). Postgres keeps those enum values (the migration in B3 does not drop them), so the generated types must keep matching them. Leave a one-line code comment above the `connection_provider` enum:

```ts
      // NOTE: simplyrets/reso/mlsgrid enum values are retained (Postgres can't
      // drop enum values cleanly); they are unused after the MLS removal.
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds. If `tsc` reports a syntax error in `database.ts`, a brace was mis-deleted in Step 3 — re-check the `mls_connections` block boundaries.

- [ ] **Step 7: Commit**

```bash
git add lib/types/database.ts
git commit -m "Drop mls_connections and mls_agent_id from DB types"
```

### Task B3: Migration dropping MLS DB objects

**Files:**
- Create: `supabase/migrations/<timestamp>_remove_mls.sql` (via the CLI)

- [ ] **Step 1: Create the migration file**

Run: `supabase migration new remove_mls`
Expected: prints the new file path under `supabase/migrations/`.

- [ ] **Step 2: Write the migration SQL**

Put this in the new file:

```sql
-- Remove the deferred MLS integration. Drops the mls_connections table (and its
-- RLS policies / trigger / index via CASCADE), the listings.connection_id FK,
-- and profiles.mls_agent_id.
--
-- Enum values 'simplyrets'/'reso'/'mlsgrid' on connection_provider and
-- listing_source are intentionally NOT dropped: Postgres has no clean
-- ALTER TYPE ... DROP VALUE, and the unused values are harmless.

drop table if exists public.mls_connections cascade;

alter table public.listings drop column if exists connection_id;

alter table public.profiles drop column if exists mls_agent_id;
```

- [ ] **Step 3: Verify the migration applies (local stack)**

If a local stack is available: `supabase start` then confirm migrations apply without error (the CLI applies pending migrations on start, or run `supabase db reset` to replay from scratch).
Expected: no SQL error.

> ⚠️ **Do NOT `supabase db push` to the cloud project as part of this task.** This is a destructive migration against project ref `srigrlqyzpfjuahmqdag`, and per CLAUDE.md local dev currently points at that cloud DB. Pushing is a deliberate, separate step the user runs after reviewing — flag it in the handoff, don't run it.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "Migration: drop mls_connections, connection_id, mls_agent_id"
```

### Task B4: Scrub MLS from docs

**Files:**
- Delete: `docs/mls-listings.md`
- Modify: `README.md`, `CLAUDE.md`, `AGENTS.md`, `PRD_STATUS.md`, `docs/architecture.md`, `docs/production.md`, `docs/README.md`

- [ ] **Step 1: Delete the MLS doc**

```bash
git rm docs/mls-listings.md
```

- [ ] **Step 2: Find every remaining MLS reference**

Run: `grep -rniE "mls|simplyrets|reso |mlsgrid|ListAgentMlsId|mls_connections|mls_agent_id" README.md CLAUDE.md AGENTS.md PRD_STATUS.md docs/ --include="*.md"`
Expected: a list of lines across the doc files above.

- [ ] **Step 3: Edit each hit**

For each file, remove the MLS/SimplyRETS/RESO/`mls_connections`/`mls_agent_id`/`docs/mls-listings.md`-link references and any sentence that only exists to describe MLS. Where a sentence mixes MLS with kept features (e.g. "manual / paste-a-URL / future MLS"), rewrite to drop the MLS clause (→ "manual or paste-a-URL"). In `CLAUDE.md`: drop `mls_connections` from the Tables list and remove the `profiles.mls_agent_id` / SimplyRETS / RESO sentences in the Listings integration paragraph. In `PRD_STATUS.md`: mark the MLS row as `Deferred` or delete it.

- [ ] **Step 4: Verify no stray references remain (except the retained enum note)**

Run: `grep -rniE "simplyrets|mls_connections|mls_agent_id|mls-listings" README.md CLAUDE.md AGENTS.md PRD_STATUS.md docs/ --include="*.md"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Docs: remove MLS integration references"
```

---

## Workstream C — Fast photo onboarding (Firecrawl + manual upload)

### Task C1: Make the `listing-photos` bucket public-read

**Files:**
- Create: `supabase/migrations/<timestamp>_listing_photos_public.sql` (via the CLI)

- [ ] **Step 1: Create the migration**

Run: `supabase migration new listing_photos_public`
Expected: prints the new file path.

- [ ] **Step 2: Write the SQL**

```sql
-- Listing photos are public marketing assets (they live on Zillow/MLS already).
-- Make the bucket public-read so an uploaded photo's URL works in a plain
-- <img src> AND can be fetched by HeyGen at generation time, exactly like a
-- scraped external URL — no signed-URL plumbing needed. Writes stay restricted
-- to the owner via the existing owner-prefixed RLS policies on storage.objects.

update storage.buckets set public = true where id = 'listing-photos';
```

- [ ] **Step 3: Verify locally (if a local stack is available)**

Apply the migration (`supabase db reset` or `supabase start`) and confirm no error.

> ⚠️ Same caution as B3: do **not** push to cloud here. This one is non-destructive but still part of the user-run push step.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "Migration: make listing-photos bucket public-read"
```

### Task C2: Photo uploader component

**Files:**
- Create: `components/listings/photo-uploader.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useRef, useState } from "react";
import { Loader2, ImagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "listing-photos";

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Drag-drop / pick image files, upload them to the public listing-photos bucket
 * under the signed-in user's prefix, and hand the resulting public URLs back to
 * the parent form via onUploaded. The parent owns the merged photo list.
 */
export function PhotoUploader({
  onUploaded,
}: {
  onUploaded: (urls: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const urls: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const path = `${user.id}/uploads/${crypto.randomUUID()}-${safeName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        urls.push(data.publicUrl);
      }
      if (urls.length) onUploaded(urls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-sm transition ${
          dragging ? "border-accent bg-accent/10" : "border-border bg-card"
        }`}
      >
        {busy ? (
          <>
            <Loader2 className="size-5 animate-spin" /> Uploading…
          </>
        ) : (
          <>
            <ImagePlus className="size-5" /> Drag photos here, or click to upload
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void upload(e.target.files)}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/listings/photo-uploader.tsx
git commit -m "Add drag-drop photo uploader to listing-photos bucket"
```

### Task C3: Wire the uploader + photo previews into the listing form

**Files:**
- Modify: `components/listings/listing-form.tsx`

- [ ] **Step 1: Add imports**

Add to the import block at the top of `components/listings/listing-form.tsx`:

```tsx
import { useState } from "react";
import { PhotoUploader } from "./photo-uploader";
```

- [ ] **Step 2: Hold the photos field in state**

Inside `ListingForm`, just after the `useActionState` call (line 65), add:

```tsx
  const [photosText, setPhotosText] = useState(
    draft?.photos?.map((p) => p.url).join("\n") ?? "",
  );
  const photoUrls = photosText
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter(Boolean);
```

- [ ] **Step 3: Replace the Photo URLs block**

Replace the photos `<div className="grid gap-2">` block (lines 132-141) with:

```tsx
      <div className="grid gap-3">
        <Label htmlFor="photos">Photos</Label>
        <PhotoUploader
          onUploaded={(urls) =>
            setPhotosText((prev) =>
              [prev, ...urls].filter(Boolean).join("\n"),
            )
          }
        />
        {photoUrls.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photoUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="aspect-square w-full rounded-lg border border-border object-cover"
              />
            ))}
          </div>
        ) : null}
        <Textarea
          id="photos"
          name="photos"
          rows={3}
          value={photosText}
          onChange={(e) => setPhotosText(e.target.value)}
          placeholder={"Or paste photo URLs, one per line\nhttps://…/photo-1.jpg"}
        />
      </div>
```

(The `<Textarea>` stays `name="photos"`, so `createListing()` in `actions.ts` keeps splitting it by newline/comma — no server-action change needed. Uploaded URLs and pasted URLs share one source of truth.)

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (The `value`/`onChange` makes the textarea controlled; ensure no leftover `defaultValue` on it.)

- [ ] **Step 5: Commit**

```bash
git add components/listings/listing-form.tsx
git commit -m "Show uploader + photo previews in the listing form"
```

### Task C4: Firecrawl URL import copy + clearer fallback

**Files:**
- Modify: `components/listings/url-import.tsx`
- Modify: `app/(app)/listings/actions.ts:122-139`
- Modify: `app/(app)/listings/new/page.tsx:13-16` (page description)
- Modify: `.env.example` (document the key) — **do not** commit a real key

- [ ] **Step 1: Update URL import copy — `components/listings/url-import.tsx`**

Change the `<Label>` (line 44) and `<Input placeholder>` (line 49):

```tsx
        <Label htmlFor="import-url">Listing URL (Zillow, Redfin, Realtor.com)</Label>
```
```tsx
          placeholder="https://www.zillow.com/homedetails/…"
```

And change the success banner text (line 33-35) to mention adding photos if some are missing:

```tsx
        <p className="rounded-xl bg-accent/30 px-3 py-2 text-sm">
          We pulled what we could from the URL. Review the details and add or
          remove photos below before saving.
        </p>
```

- [ ] **Step 2: Sharpen the import error — `app/(app)/listings/actions.ts`**

In `importFromUrl` (lines 129-134), change the "no draft" error string to point at manual upload:

```ts
    if (!draft) {
      return {
        error:
          "Couldn't read that link (some sites block scraping). Switch to Manual entry and drag your photos in instead.",
      };
    }
```

- [ ] **Step 3: Update the new-listing page description — `app/(app)/listings/new/page.tsx`**

Change the `PageHeader description` (line 15):

```tsx
        description="Paste a Zillow/Redfin/Realtor link to auto-import, or enter details and drag in photos."
```

- [ ] **Step 4: Document the Firecrawl key in `.env.example`**

Confirm `.env.example` already has the `FIRECRAWL_API_KEY=` line (it does, ~line 25). Update its comment to make the Zillow dependency explicit:

```
# --- Firecrawl (URL listing import past bot walls) ---
# REQUIRED for Zillow/Redfin/Realtor URL import to return full photo sets — the
# plain-fetch fallback gets blocked by those sites. Free key from firecrawl.dev.
# When unset, agents use the Manual entry tab + drag-drop photo upload instead.
FIRECRAWL_API_KEY=
```

- [ ] **Step 5: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add components/listings/url-import.tsx "app/(app)/listings/actions.ts" "app/(app)/listings/new/page.tsx" .env.example
git commit -m "Clarify URL import copy + manual-upload fallback"
```

### Task C5: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Add a real Firecrawl key locally (user action)**

Add `FIRECRAWL_API_KEY=<key>` to `.env.local` (gitignored). Without it, only the manual-upload path is testable — that's expected and fine.

- [ ] **Step 2: Run the dev server and exercise both paths**

Run: `npm run dev`, open http://localhost:3000, go to **Add a listing**:
- **Manual entry:** drag 2-3 photos onto the uploader → thumbnails appear, the textarea fills with public URLs → Save → the listing detail shows the photos.
- **Import from URL** (if a key is set): paste a Zillow URL → details + photos populate → Save.

Expected: photos render (public bucket URLs resolve), listing saves, and a generated video uses the photos. Open a saved photo URL in a fresh tab to confirm public-read works.

- [ ] **Step 3: Confirm MLS surfaces are gone**

Visit `/settings` — no "MLS connection" tile; `/settings/connections` 404s; the profile form has no MLS agent ID field.

---

## Self-review notes (for the implementer)

- **Build-green invariant:** B1 removes all *code* references to MLS before B2 removes the *types*; B2's untouched enum unions still match the DB because B3 deliberately leaves enum values. Don't reorder B2 before B1.
- **No new photo schema:** `listings.photos` stays `{ url, caption?, order }[]`; uploaded photos are just public URLs in that same array.
- **Pushing migrations to cloud (B3, C1) is intentionally NOT automated** — it's destructive/shared and the user runs it after review.
