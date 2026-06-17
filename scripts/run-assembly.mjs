// Finish the most-recent video by running the app's OWN assembler locally (no
// serverless timeout). Resets a stale `submitting` lock, then drives the
// lipsync pipeline (Stage B: stitch+fire lipsync, Stage C: finalize) against the
// configured (prod) Supabase. Real HeyGen calls (HEYGEN_MOCK must be 0).
import { createClient } from "@supabase/supabase-js";
import { assembleHypeReel, isHypeReel } from "../lib/video/hypereel.ts";
import { assembleCinematicVideo, isCinematic } from "../lib/video/cinematic.ts";
import { listingPhotos } from "../lib/format.ts";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function load() {
  const { data: v } = await sb
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return v;
}

let v = await load();
console.log(`target ${v.id}  status=${v.status}  kind=${isHypeReel(v.heygen_video_id) ? "hype" : isCinematic(v.heygen_video_id) ? "cine" : "?"}`);

// Clear any prior (failed) lipsync/narration so Stage B re-stitches fresh, and
// reset the lock so the assembler can re-claim it.
{
  const seg = v.script_segments || {};
  const { lipsync, narration, lipsyncs, narrations, montageUrl, montageNarration, lipOpener, lipCloser, roomNarration, roomPerClipMs, openerNarration, closerNarration, ...keep } = seg;
  await sb
    .from("videos")
    .update({ status: "processing", error: null, script_segments: keep })
    .eq("id", v.id);
  console.log(`reset → processing (cleared bookend lipsyncs)`);
}

for (let i = 1; i <= 20; i++) {
  v = await load();
  if (v.status === "completed") { console.log(`✅ completed — video_url ${v.video_url ? "set" : "MISSING"}`); break; }
  if (v.status === "failed") { console.log(`❌ failed: ${v.error}`); break; }

  const { data: lst } = await sb.from("listings").select("*").eq("id", v.listing_id ?? "").maybeSingle();
  const photos = lst ? listingPhotos(lst.photos).map((p) => p.url) : [];
  const { data: av } = await sb.from("avatars").select("voice_id").eq("id", v.avatar_id ?? "").maybeSingle();
  const seg = v.script_segments || {};

  let result;
  if (isHypeReel(v.heygen_video_id)) {
    const meta = seg.hypeReel;
    result = await assembleHypeReel(sb, {
      id: v.id, user_id: v.user_id, heygen_video_id: v.heygen_video_id, photos,
      facts: {
        price: lst?.price ? `$${Math.round(Number(lst.price)).toLocaleString("en-US")}` : null,
        beds: lst?.beds ?? null, baths: lst?.baths ?? null, sqft: lst?.sqft ?? null, address: lst?.address ?? null,
      },
      featureCallouts: meta?.featureCallouts ?? [],
      trackId: meta?.trackId ?? null,
      beats: seg.beats ?? null,
      captions: seg.captions ?? false,
      voiceId: av?.voice_id ?? null,
    });
  } else if (isCinematic(v.heygen_video_id)) {
    result = await assembleCinematicVideo(sb, {
      id: v.id, user_id: v.user_id, script: v.script,
      beats: seg.beats ?? null,
      captions: seg.captions ?? false,
      heygen_video_id: v.heygen_video_id, photos,
    }, av?.voice_id ?? null);
  } else { console.log("not a reel/cine video"); break; }

  const s2 = (await load()).script_segments || {};
  console.log(`[run ${i}] → ${result}  (lipsync=${s2.lipsync ? "fired" : "—"})`);
  if (result === "completed" || result === "failed") {
    const f = await load();
    console.log(f.status === "completed" ? `✅ video_url ${f.video_url ? "set" : "MISSING"}` : `❌ ${f.error}`);
    break;
  }
  await sleep(25000); // lipsync still rendering — wait then poll again
}
