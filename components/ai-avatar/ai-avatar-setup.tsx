"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ImagePlus, Mic, Check, Camera, Square, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { setupAiAvatar } from "@/app/(app)/videos/ai-actions";

const BUCKET = "listing-photos"; // public bucket → Runway/ElevenLabs can fetch

// A natural ~30s paragraph to read aloud — varied sounds + an upbeat real-estate
// cadence give ElevenLabs a strong, on-brand voice clone.
const VOICE_SCRIPT =
  "Hey everyone, thanks so much for stopping by — I'm really excited to show you " +
  "around today! This home has incredible natural light, beautiful open spaces, and " +
  "all the little details that make a place feel special. Whether you're cooking in " +
  "the kitchen, relaxing in the living room, or unwinding out back, there's something " +
  "here for everyone. If you love what you see, reach out and let's set up a private " +
  "tour — I'd love to help you find your dream home.";

/**
 * One-time setup for the Runway + ElevenLabs pipeline. The agent's reference
 * PHOTO (Runway likeness) and a VOICE sample (ElevenLabs clone) can be either
 * UPLOADED or recorded **in-app** (webcam snapshot + mic recording). Both upload
 * to the public bucket, then setupAiAvatar clones the voice + persists.
 */
export function AiAvatarSetup({ ready = false }: { ready?: boolean }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "photo" | "voice" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(ready);

  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [recSec, setRecSec] = useState(0);

  const photoRef = useRef<HTMLInputElement>(null);
  const voiceRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Always release camera/mic tracks on unmount.
  useEffect(() => () => stopTracks(), []);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function uploadBlob(blob: Blob, kind: "photo" | "voice", ext: string) {
    setError(null);
    setBusy(kind);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const path = `${user.id}/ai-avatar/${kind}-${crypto.randomUUID()}.${ext}`;
      const { error: e } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type || undefined, upsert: true });
      if (e) throw new Error(e.message);
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      if (kind === "photo") setPhotoUrl(url);
      else setVoiceUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  // ---- Webcam photo ----
  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 1080, height: 1920 },
        audio: false,
      });
      streamRef.current = stream;
      setCamOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setError("Couldn't access the camera — allow permission or upload a photo instead.");
    }
  }
  function capturePhoto() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 1080;
    canvas.height = v.videoHeight || 1920;
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) void uploadBlob(blob, "photo", "jpg");
        stopTracks();
        setCamOn(false);
      },
      "image/jpeg",
      0.92,
    );
  }

  // ---- Mic voice ----
  async function startMic() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const ext = (rec.mimeType || "audio/webm").includes("mp4") ? "mp4" : "webm";
        void uploadBlob(blob, "voice", ext);
        stopTracks();
      };
      recorderRef.current = rec;
      rec.start();
      setMicOn(true);
      setRecSec(0);
      timerRef.current = setInterval(
        () =>
          setRecSec((s) => {
            if (s >= 90) stopMic(); // hard cap ~90s
            return s + 1;
          }),
        1000,
      );
    } catch {
      setError("Couldn't access the mic — allow permission or upload a clip instead.");
    }
  }
  function stopMic() {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    setMicOn(false);
  }

  async function save() {
    if (!photoUrl || !voiceUrl) return;
    setError(null);
    setBusy("save");
    try {
      const res = await setupAiAvatar({ agentImageUrl: photoUrl, voiceSampleUrl: voiceUrl });
      if (res?.error) setError(res.error);
      else setDone(true);
    } finally {
      setBusy(null);
    }
  }

  const mmss = `${String(Math.floor(recSec / 60)).padStart(1, "0")}:${String(recSec % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="font-heading text-base font-bold">AI avatar (Runway + ElevenLabs)</h3>
        {done && (
          <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-xs text-background">
            <Check className="size-3" /> ready
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        A clear photo of you (chest-up, good light) and a 30–60s voice clip. Record
        right here or upload — used for realistic walking tours with your cloned voice.
      </p>

      {/* Live camera preview while recording a photo */}
      {camOn && (
        <div className="mb-3 overflow-hidden rounded-xl border border-border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="mx-auto max-h-72 w-auto" muted playsInline />
          <div className="flex items-center justify-center gap-2 p-2">
            <Button type="button" size="sm" onClick={capturePhoto} className="rounded-full">
              <Camera className="size-4" /> Capture
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full"
              onClick={() => {
                stopTracks();
                setCamOn(false);
              }}
            >
              <X className="size-4" /> Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Photo */}
        <div className="rounded-xl border border-dashed border-border bg-background p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            {photoUrl ? <Check className="size-4 text-foreground" /> : <ImagePlus className="size-4" />}
            {busy === "photo" ? "Uploading…" : photoUrl ? "Photo ready" : "Agent photo"}
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="rounded-full"
              disabled={busy === "photo"} onClick={() => (camOn ? stopTracks() : startCamera())}>
              <Camera className="size-4" /> Take picture
            </Button>
            <Button type="button" size="sm" variant="ghost" className="rounded-full"
              disabled={busy === "photo"} onClick={() => photoRef.current?.click()}>
              Upload
            </Button>
          </div>
        </div>

        {/* Voice */}
        <div className="rounded-xl border border-dashed border-border bg-background p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            {voiceUrl ? <Check className="size-4 text-foreground" /> : <Mic className="size-4" />}
            {busy === "voice" ? "Uploading…" : voiceUrl ? "Voice ready" : "Voice clip"}
          </div>
          <p className="mb-1 text-xs text-muted-foreground">
            Hit record and read this aloud, naturally:
          </p>
          <blockquote
            className={`mb-2 max-h-28 overflow-y-auto rounded-lg border-l-2 p-2 text-xs italic ${
              micOn ? "border-foreground bg-muted/60" : "border-border bg-muted/30"
            }`}
          >
            {VOICE_SCRIPT}
          </blockquote>
          <div className="flex items-center gap-2">
            {micOn ? (
              <Button type="button" size="sm" className="rounded-full" onClick={stopMic}>
                <Square className="size-4" /> Stop {mmss}
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" className="rounded-full"
                disabled={busy === "voice"} onClick={startMic}>
                <Mic className="size-4" /> Record
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" className="rounded-full"
              disabled={busy === "voice" || micOn} onClick={() => voiceRef.current?.click()}>
              Upload
            </Button>
          </div>
          {voiceUrl && !micOn && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio src={voiceUrl} controls className="mt-2 w-full" />
          )}
        </div>
      </div>

      <input ref={photoRef} type="file" accept="image/*" hidden
        onChange={(e) => e.target.files?.[0] && uploadBlob(e.target.files[0], "photo", (e.target.files[0].name.split(".").pop() || "jpg"))} />
      <input ref={voiceRef} type="file" accept="audio/*" hidden
        onChange={(e) => e.target.files?.[0] && uploadBlob(e.target.files[0], "voice", (e.target.files[0].name.split(".").pop() || "mp3"))} />

      <Button type="button" onClick={save}
        disabled={!photoUrl || !voiceUrl || busy === "save"} className="mt-3 w-full rounded-full">
        {busy === "save" ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Cloning voice…
          </>
        ) : done ? (
          "Update AI avatar"
        ) : (
          "Save AI avatar"
        )}
      </Button>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
