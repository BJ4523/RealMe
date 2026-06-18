// One-off: generate a FRESH cinematic reel through the new path (twin lip-synced
// bookends + Ken-Burns real-photo b-roll + one continuous voice), owned by the user,
// and drive it to completion locally. Real HeyGen (HEYGEN_MOCK=0).
import { createClient } from "@supabase/supabase-js";
import { generateCinematicClip } from "../lib/heygen/cinematic.ts";
import { encodeCinematicJobs, assembleCinematicVideo } from "../lib/video/cinematic.ts";
import {
  generateOpeningPitch,
  generateRoomNarration,
  generateHypeReelScript,
} from "../lib/ai/script.ts";
import { listingPhotos } from "../lib/format.ts";
import { planReel, shortLine } from "../lib/video/timing.ts";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const estClipSec = (t) =>
  Math.min(15, Math.max(3, Math.round(((t || "").split(/\s+/).filter(Boolean).length || 8) / 2.5)));

// Mirror the app: a real seconds TARGET + room count → planReel → per-room words.
const TARGET_SEC = 20;
const ROOMS = 3;
const { roomWords, estSec } = planReel(TARGET_SEC, ROOMS);
console.log(`plan: target ${TARGET_SEC}s · ${ROOMS} rooms → ${roomWords} words/room · est ${estSec}s`);
const WARDROBE = "in a tailored navy blazer over a crisp white shirt";
const exteriorPrompt = (role) =>
  [
    "Vertical 9:16 real-estate intro filmed on a smooth gimbal — BRIGHT, crisp, true-to-life.",
    `The real-estate agent ${WARDROBE} stands ${role === "closer" ? "in the backyard / outdoor space" : "in front of the house"} shown in the reference image,`,
    "facing the camera and speaking warmly to the viewer — mouth moving naturally, head and",
    "shoulders prominent, face clearly visible the ENTIRE clip (this is the lip-sync anchor).",
    "Being professionally FILMED by a separate operator — NOT a selfie: both hands free, no",
    "phone/device, no arm to the lens. EXACTLY ONE person.",
    "CRITICAL — this is ONE SPECIFIC real person: the provided avatar. Preserve their EXACT",
    "face, facial features, bone structure, skin tone, hair and age PRECISELY and IDENTICALLY.",
    "Do NOT invent, beautify, age, or substitute a different/generic person — the face must",
    "match the avatar exactly, the same in this shot as in the other bookend shot.",
  ].join(" ");

// --- gather user / twin / listing -------------------------------------------
const { data: lastVid } = await sb
  .from("videos").select("user_id").order("created_at", { ascending: false }).limit(1).single();
const uid = lastVid.user_id;
const { data: av } = await sb
  .from("avatars").select("id,heygen_avatar_id,voice_id").eq("user_id", uid).eq("is_active", true).maybeSingle();
const lookId = av.heygen_avatar_id;
const voiceId = av.voice_id ?? null;

const { data: listings } = await sb
  .from("listings").select("*").eq("user_id", uid).limit(20);
const listing = listings
  .map((l) => ({ l, n: Array.isArray(l.photos) ? l.photos.length : 0 }))
  .sort((a, b) => b.n - a.n)[0].l;
const photos = listingPhotos(listing.photos).map((p) => p.url);
console.log(`user ${uid.slice(0, 8)} | look ${lookId?.slice(0, 10)} | listing "${listing.address}" (${photos.length} photos)`);

const exterior = photos[0];
const backyard = photos[photos.length - 1] ?? exterior;
const roomPhotos = photos.slice(1, Math.max(1, photos.length - 1)).slice(0, ROOMS);

// --- beats (Claude) ---------------------------------------------------------
console.log("writing script…");
const openingPitch = await generateOpeningPitch(listing);
const [hook, roomLines] = await Promise.all([
  generateHypeReelScript(listing),
  generateRoomNarration(roomPhotos, listing, openingPitch, "classic", roomWords),
]);
const cta = hook.outro?.trim() || "Reach out today to come see it in person.";
const openerBeat = shortLine(openingPitch, 10);
const beats = [openerBeat, ...roomLines, shortLine(cta, 10)];
console.log(`beats: opener(${openerBeat.split(/\s+/).length}w) + ${roomLines.length} rooms + closer(${cta.split(/\s+/).length}w)`);

// --- fire the 2 twin bookend clips -----------------------------------------
console.log("firing twin bookend clips (opener + closer)…");
const [opener, closer] = await Promise.all([
  generateCinematicClip({ avatarLookId: lookId, referenceUrl: exterior, prompt: exteriorPrompt("intro"), duration: estClipSec(openerBeat) }),
  generateCinematicClip({ avatarLookId: lookId, referenceUrl: backyard, prompt: exteriorPrompt("closer"), duration: estClipSec(shortLine(cta, 10)) }),
]);
console.log("bookend jobs:", opener.jobId.slice(0, 10), closer.jobId.slice(0, 10));

// --- create the video row (owned by the user) ------------------------------
const { data: video } = await sb
  .from("videos")
  .insert({
    user_id: uid,
    listing_id: listing.id,
    avatar_id: av.id,
    title: `${listing.address} — cinematic`,
    status: "processing",
    script: openingPitch,
    heygen_video_id: encodeCinematicJobs(opener.jobId, closer.jobId, []),
    thumbnail_url: exterior,
    script_segments: { beats, captions: false, roomPhotos },
  })
  .select("*")
  .single();
console.log(`video ${video.id} created → /videos/${video.id}`);

// --- drive to completion ----------------------------------------------------
for (let i = 1; i <= 24; i++) {
  const { data: v } = await sb.from("videos").select("*").eq("id", video.id).single();
  if (v.status === "completed") { console.log(`✅ COMPLETED — ${v.video_url ? "url ready" : "no url"}`); break; }
  if (v.status === "failed") { console.log(`❌ failed: ${v.error}`); break; }
  if (v.status === "submitting") await sb.from("videos").update({ status: "processing" }).eq("id", video.id).eq("status", "submitting");
  const { data: vv } = await sb.from("videos").select("*").eq("id", video.id).single();
  const r = await assembleCinematicVideo(sb, {
    id: vv.id, user_id: vv.user_id, script: vv.script,
    beats: vv.script_segments?.beats ?? null,
    captions: false, heygen_video_id: vv.heygen_video_id, photos: [],
  }, voiceId);
  const s = (await sb.from("videos").select("script_segments").eq("id", video.id).single()).data.script_segments || {};
  console.log(`[${i}] → ${r}  (bookend lipsync ${s.lipOpener ? "fired" : "—"})`);
  if (r === "completed" || r === "failed") {
    const { data: f } = await sb.from("videos").select("status,error,video_url").eq("id", video.id).single();
    console.log(f.status === "completed" ? `✅ ${f.video_url ? "url ready" : "no url"}` : `❌ ${f.error}`);
    break;
  }
  await sleep(30000);
}
