"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Video, UploadCloud } from "lucide-react";
import { createAvatar, type AvatarState } from "@/app/(app)/onboarding/actions";
import { createClient } from "@/lib/supabase/client";
import { compressVideo } from "@/lib/video/compress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Clips at or below this upload FULL (no compression); larger ones are compressed
// in-browser to ~1080p to land under the Storage upload limit. This is capped by
// the Supabase project's global upload limit (default 50 MiB). To store bigger
// raw clips, raise that limit in the Supabase dashboard (Settings → Storage →
// Upload file size limit) and bump this constant to match.
const STORAGE_LIMIT_BYTES = 48 * 1024 * 1024; // keep < the 50 MiB global default
const COMPRESS_TARGET_BYTES = STORAGE_LIMIT_BYTES;
const MAX_INPUT_BYTES = 1024 * 1024 * 1024; // 1GB sanity ceiling
// HeyGen rejects digital-twin footage outside this window.
const MIN_DURATION_S = 15;
const MAX_DURATION_S = 600;

/** Read a video file's duration (seconds) via a throwaway <video> element. */
function probeDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = () => reject(new Error("Could not read video metadata."));
    el.src = url;
  });
}

/**
 * Avatar = Digital Twin. The agent provides one 15–60s clip of themselves;
 * HeyGen trains a realistic twin (and clones the voice) from it. Big clips are
 * compressed in-browser to fit Storage. Cinematic mode is unlocked separately,
 * after the twin is ready, via the consent recorder on the avatar page (cinematic
 * needs HeyGen's identity-consent, which the in-creation API does not accept).
 */
export function AvatarUploader({ redirectTo = "/app" }: { redirectTo?: string }) {
  const router = useRouter();
  const [state, formAction, actionPending] = useActionState<AvatarState, FormData>(
    createAvatar,
    undefined,
  );
  const [video, setVideo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "compressing" | "uploading">("idle");
  const [compressPct, setCompressPct] = useState(0);
  const [clientError, setClientError] = useState<string | null>(null);
  const durationRef = useRef<number | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const recordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) router.push(redirectTo);
  }, [state, router, redirectTo]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) return setClientError("Please choose a video file.");
    if (file.size > MAX_INPUT_BYTES)
      return setClientError("That video is too large to process — keep it to ~15–60s.");

    const url = URL.createObjectURL(file);
    durationRef.current = null;
    try {
      const dur = await probeDuration(url);
      durationRef.current = dur;
      if (Number.isFinite(dur) && (dur < MIN_DURATION_S || dur > MAX_DURATION_S)) {
        URL.revokeObjectURL(url);
        return setClientError(
          `Clip is ${Math.round(dur)}s — it must be ${MIN_DURATION_S}–${MAX_DURATION_S}s. Record a single continuous 15–60s take.`,
        );
      }
    } catch {
      /* metadata unreadable — let HeyGen validate */
    }
    setClientError(null);
    setVideo(file);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return url;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);
    if (!video) return setClientError("Upload or record a video of yourself.");

    const name =
      (e.currentTarget.elements.namedItem("name") as HTMLInputElement | null)?.value ||
      "My avatar";

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setClientError("Your session expired. Please sign in again.");

      // Big phone clips won't fit the Storage bucket, so transcode in-browser to
      // a small MP4 first. ffmpeg.wasm is heavy — only load it when needed.
      let toUpload = video;
      if (video.size > COMPRESS_TARGET_BYTES) {
        setPhase("compressing");
        setCompressPct(0);
        toUpload = await compressVideo(video, {
          durationSec: durationRef.current ?? 30,
          targetBytes: COMPRESS_TARGET_BYTES,
          onProgress: (f) => setCompressPct(Math.round(f * 100)),
        });
      }

      setPhase("uploading");
      const ext = toUpload.name.split(".").pop() || "mp4";
      const videoPath = `${user.id}/twin-${Date.now()}.${ext}`;
      const up = await supabase.storage
        .from("avatar-sources")
        .upload(videoPath, toUpload, {
          contentType: toUpload.type || "video/mp4",
          upsert: true,
        });
      if (up.error) return setClientError(`Video upload failed: ${up.error.message}`);

      const fd = new FormData();
      fd.set("photoPath", videoPath);
      fd.set("photoContentType", toUpload.type || "video/mp4");
      fd.set("name", name);
      formAction(fd);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPhase("idle");
    }
  }

  const pending = phase !== "idle" || actionPending;
  const error = clientError ?? state?.error;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        One clear, continuous <strong className="text-foreground">15–60s</strong> clip of you
        talking to camera. We build a twin that looks and sounds like you — no separate voice
        needed. (Cinematic mode is unlocked after, with a quick consent recording.)
      </p>

      <button
        type="button"
        onClick={() => uploadRef.current?.click()}
        className="group mx-auto flex aspect-[9/16] w-full max-w-[240px] flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-foreground/40"
      >
        {preview ? (
          <video src={preview} className="size-full object-cover" muted playsInline autoPlay loop />
        ) : (
          <>
            <Video className="size-8 transition-transform group-hover:scale-110" />
            <span className="text-sm font-medium text-foreground">Add a video of yourself</span>
            <span className="px-6 text-center text-xs">15–60s, single continuous take</span>
          </>
        )}
      </button>

      <div className="mx-auto grid w-full max-w-[240px] grid-cols-2 gap-3">
        <Button type="button" variant="outline" className="rounded-full" onClick={() => uploadRef.current?.click()}>
          <UploadCloud className="size-4" /> Upload
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={() => recordRef.current?.click()}>
          <Video className="size-4" /> Record
        </Button>
      </div>

      <input ref={uploadRef} type="file" accept="video/*" className="hidden" onChange={onPick} />
      <input ref={recordRef} type="file" accept="video/*" capture="user" className="hidden" onChange={onPick} />

      <div className="grid gap-2">
        <label htmlFor="name" className="text-sm font-medium">Avatar name</label>
        <Input id="name" name="name" defaultValue="My avatar" className="max-w-xs" />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending || !video}
        className="w-full rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
      >
        {pending ? (
          <>
            <Sparkles className="size-4 animate-pulse" />{" "}
            {phase === "compressing"
              ? `Compressing… ${compressPct}%`
              : phase === "uploading"
                ? "Uploading…"
                : "Creating your AI twin…"}
          </>
        ) : (
          "Create my AI twin"
        )}
      </Button>
    </form>
  );
}
