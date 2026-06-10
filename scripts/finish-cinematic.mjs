// One-off: finish a stuck cinematic video — download its cached Seedance clips,
// generate the cloned-voice narration, stitch + mux, upload to video-cache via
// the service role, and mark the row completed. Reuses cached clips (no re-render).
//   node scripts/finish-cinematic.mjs <videoId>
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readFileSync as rf } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SVC = env.SUPABASE_SERVICE_ROLE_KEY, HK = env.HEYGEN_API_KEY;
const DEFAULT_VOICE = env.HEYGEN_DEFAULT_VOICE_ID || "1bd001e7e50f421d891986aad5158bc8";
const vid = process.argv[2];
if (!vid) throw new Error("pass a video id");
const db = createClient(URL, SVC, { auth: { persistSession: false } });

const { data: v, error } = await db.from("videos").select("*").eq("id", vid).single();
if (error) throw error;
const jobs = (v.heygen_video_id || "").replace(/^cine:/, "").split(",").filter(Boolean);
console.log("clips:", jobs);

// clip urls
const clipUrls = [];
for (const j of jobs) {
  const r = await fetch(`https://api.heygen.com/v3/videos/${j}`, { headers: { "X-Api-Key": HK } });
  const d = (await r.json()).data;
  if (d.status !== "completed" || !d.video_url) throw new Error(`clip ${j} not ready: ${d.status}`);
  clipUrls.push(d.video_url);
}

// voice
let voiceId = DEFAULT_VOICE;
if (v.avatar_id) {
  const { data: a } = await db.from("avatars").select("voice_id").eq("id", v.avatar_id).maybeSingle();
  if (a?.voice_id) voiceId = a.voice_id;
}
// narration
const tts = await (await fetch("https://api.heygen.com/v1/audio/text_to_speech", {
  method: "POST", headers: { "X-Api-Key": HK, "Content-Type": "application/json" },
  body: JSON.stringify({ voice_id: voiceId, text: (v.script || "Welcome to this beautiful home.").trim() }),
})).json();
const narrUrl = tts.data.audio_url, duration = tts.data.duration;
console.log("narration:", Math.round(duration), "s, voice", voiceId);

// download + stitch
const dir = mkdtempSync(join(tmpdir(), "fin-"));
const clipPaths = [];
for (let i = 0; i < clipUrls.length; i++) {
  const buf = Buffer.from(await (await fetch(clipUrls[i])).arrayBuffer());
  const p = join(dir, `c${i}.mp4`); writeFileSync(p, buf); clipPaths.push(p);
}
const narrPath = join(dir, "narr.wav");
writeFileSync(narrPath, Buffer.from(await (await fetch(narrUrl)).arrayBuffer()));
const out = join(dir, "out.mp4");
const inputs = clipPaths.flatMap((p) => ["-i", p]).concat(["-i", narrPath]);
const concat = clipPaths.map((_, i) => `[${i}:v:0]`).join("") + `concat=n=${clipPaths.length}:v=1:a=0[v]`;
execFileSync(ffmpegPath, [
  "-y", ...inputs, "-filter_complex", concat, "-map", "[v]", "-map", `${clipPaths.length}:a:0`,
  "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
  "-shortest", "-movflags", "+faststart", out,
], { stdio: "inherit" });

// upload + complete
const path = `${v.user_id}/${v.id}.mp4`;
const up = await db.storage.from("video-cache").upload(path, rf(out), { contentType: "video/mp4", upsert: true });
if (up.error) throw up.error;
const { data: signed } = await db.storage.from("video-cache").createSignedUrl(path, 60 * 60 * 24 * 7);
await db.from("videos").update({ status: "completed", video_url: signed.signedUrl, duration: Math.round(duration) || null }).eq("id", v.id);
rmSync(dir, { recursive: true, force: true });
console.log("\n✅ DONE — video marked completed");
console.log("URL:", signed.signedUrl.slice(0, 90) + "…");
