// DEMO: cinematic reel with AI-REMAKE b-roll — lip-synced twin bookends + the twin
// walking through cinematic_avatar AI-recreated rooms (not Ken-Burns photos) + one
// continuous voice. Owned by the user. Real HeyGen (HEYGEN_MOCK=0).
import { createClient } from "@supabase/supabase-js";
import { generateCinematicClip } from "../lib/heygen/cinematic.ts";
import { encodeCinematicJobs, assembleCinematicVideo } from "../lib/video/cinematic.ts";
import { generateNarration } from "../lib/video/assemble.ts";
import { generateOpeningPitch, generateRoomNarration, generateHypeReelScript } from "../lib/ai/script.ts";
import { listingPhotos } from "../lib/format.ts";
import { planReel, shortLine } from "../lib/video/timing.ts";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wc = (t) => (t || "").trim().split(/\s+/).filter(Boolean).length || 1;
const estClip = (t) => Math.min(15, Math.max(4, Math.round(wc(t) / 2.5)));

const TARGET_SEC = 24, ROOMS = 3;
const { roomWords } = planReel(TARGET_SEC, ROOMS);
const WARDROBE = "in a tailored navy blazer over a crisp white shirt";
const exteriorPrompt = (role) => [
  "Vertical 9:16 real-estate intro on a smooth gimbal — BRIGHT, crisp, true-to-life.",
  `The real-estate agent ${WARDROBE} stands ${role === "closer" ? "outside the home" : "in front of the house"} shown in the reference,`,
  "facing the camera and speaking warmly — face clearly visible the ENTIRE clip (lip-sync anchor).",
  "Professionally FILMED (not a selfie); EXACTLY ONE person.",
  "CRITICAL: the EXACT face of the provided avatar — do NOT substitute a different/generic person.",
].join(" ");
const roomPrompt = (place) => [
  "Bright, crisp vertical 9:16 real-estate WALKING TOUR on a smooth gimbal — clean daylight, sharp, true color.",
  "Recreate the room in the reference image FAITHFULLY: same layout, furniture, finishes. Do NOT invent or rearrange.",
  `Inside that recreated room of ${place}, the SAME real-estate agent ${WARDROBE} walks through and presents the space —`,
  "moving naturally, gesturing to features, cinematic and premium.",
  "CRITICAL: the EXACT face of the provided avatar — do NOT substitute a different/generic person. EXACTLY ONE person.",
].join(" ");

const { data: lastVid } = await sb.from("videos").select("user_id").order("created_at", { ascending: false }).limit(1).single();
const uid = lastVid.user_id;
const { data: av } = await sb.from("avatars").select("id,heygen_avatar_id,voice_id").eq("user_id", uid).eq("is_active", true).maybeSingle();
const lookId = av.heygen_avatar_id, voiceId = av.voice_id ?? null;
const { data: listings } = await sb.from("listings").select("*").eq("user_id", uid).limit(20);
const listing = listings.map((l) => ({ l, n: Array.isArray(l.photos) ? l.photos.length : 0 })).sort((a, b) => b.n - a.n)[0].l;
const photos = listingPhotos(listing.photos).map((p) => p.url);
const place = listing.address ? `the home at ${listing.address}` : "this home";
console.log(`user ${uid.slice(0, 8)} | look ${lookId?.slice(0, 10)} | "${listing.address}" (${photos.length} photos)`);

const exterior = photos[0];
const roomPhotos = photos.slice(1, Math.max(1, photos.length - 1)).slice(0, ROOMS);

console.log("writing script…");
const openingPitch = await generateOpeningPitch(listing);
const [hook, roomLines] = await Promise.all([
  generateHypeReelScript(listing),
  generateRoomNarration(roomPhotos, listing, openingPitch, "classic", roomWords),
]);
const cta = hook.outro?.trim() || "Reach out today to come see it in person.";
const beats = [shortLine(openingPitch, 10), ...roomLines, shortLine(cta, 10)];
console.log(`beats: opener + ${roomLines.length} cinematic rooms + closer`);

console.log("generating voice (voice-first)…");
const narr = await generateNarration(sb, beats.join("  "), voiceId, `${uid}/demo-broll-${Date.now ? "x" : "x"}-tts`);
const W = beats.reduce((n, b) => n + wc(b), 0) || 1;
const dur = (s) => Math.min(15, Math.max(4, Math.round(s)));
const openerSec = dur((narr.dur * wc(beats[0])) / W);
const closerSec = dur((narr.dur * wc(beats[beats.length - 1])) / W);

console.log("firing twin bookends + cinematic ROOM clips…");
const [opener, closer, ...roomJobs] = await Promise.all([
  generateCinematicClip({ avatarLookId: lookId, referenceUrl: exterior, prompt: exteriorPrompt("intro"), duration: openerSec }),
  generateCinematicClip({ avatarLookId: lookId, referenceUrl: photos[photos.length - 1] || exterior, prompt: exteriorPrompt("closer"), duration: closerSec }),
  ...roomPhotos.map((url, i) => generateCinematicClip({ avatarLookId: lookId, referenceUrl: url, prompt: roomPrompt(place), duration: estClip(roomLines[i]) })),
]);
const roomIds = roomJobs.map((j) => j.jobId);
console.log("opener", opener.jobId.slice(0, 8), "closer", closer.jobId.slice(0, 8), "rooms", roomIds.map((r) => r.slice(0, 8)).join(","));

const { data: video } = await sb.from("videos").insert({
  user_id: uid, listing_id: listing.id, avatar_id: av.id,
  title: `${listing.address} — cinematic AI b-roll`, status: "processing", script: openingPitch,
  heygen_video_id: encodeCinematicJobs(opener.jobId, closer.jobId, roomIds),
  thumbnail_url: exterior,
  script_segments: { beats, captions: false, roomPhotos, ttsAudio: narr.audioUrl, ttsDur: narr.dur },
}).select("*").single();
console.log(`video ${video.id} → /videos/${video.id}`);

for (let i = 1; i <= 28; i++) {
  const { data: v } = await sb.from("videos").select("*").eq("id", video.id).maybeSingle();
  if (!v) { await sleep(15000); continue; }
  if (v.status === "completed") { console.log(`✅ COMPLETED — ${v.video_url ? "url READY" : "-"}`); break; }
  if (v.status === "failed") { console.log(`❌ ${v.error}`); break; }
  if (v.status === "submitting") await sb.from("videos").update({ status: "processing" }).eq("id", video.id).eq("status", "submitting");
  const { data: vv } = await sb.from("videos").select("*").eq("id", video.id).single();
  const r = await assembleCinematicVideo(sb, { id: vv.id, user_id: vv.user_id, script: vv.script, beats: vv.script_segments?.beats ?? null, captions: false, heygen_video_id: vv.heygen_video_id, photos: [] }, voiceId);
  console.log(`[${i}] → ${r}`);
  if (r === "completed" || r === "failed") { const { data: f } = await sb.from("videos").select("status,error,video_url").eq("id", video.id).single(); console.log(f.status, f.video_url ? "url READY" : "", f.error || ""); break; }
  await sleep(30000);
}
