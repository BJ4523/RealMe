"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Video, UploadCloud } from "lucide-react";
import { createAvatar, type AvatarState } from "@/app/(app)/onboarding/actions";
import { createClient } from "@/lib/supabase/client";
import { compressVideo } from "@/lib/video/compress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Clips at or below this upload as-is; larger ones are compressed in the browser
// to land under the 50MiB Storage bucket cap before upload.
const COMPRESS_TARGET_BYTES = 42 * 1024 * 1024;
// Sanity ceiling on the raw file we'll even try to load into ffmpeg.wasm.
const MAX_INPUT_BYTES = 1024 * 1024 * 1024; // 1GB
// HeyGen rejects digital-twin footage outside this window ("Footage is too
// short or too long" — a training failure that only surfaces minutes later), so
// catch it in the browser before we ever upload.
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
 * Avatar = Digital Twin. The agent must provide a short VIDEO of themselves
 * (upload an existing clip, or record one — `capture` opens the camera on
 * mobile). HeyGen trains a realistic twin from it (v3); see onboarding/actions.
 */
export function AvatarUploader({ redirectTo = "/app" }: { redirectTo?: string }) {
  const router = useRouter();
  const [state, formAction, actionPending] = useActionState<AvatarState, FormData>(
    createAvatar,
    undefined,
  );
  const [video, setVideo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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
    if (!file.type.startsWith("video/")) {
      setClientError("Please choose a video file.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setClientError("That video is too large to process — keep it to ~15–60s.");
      return;
    }

    const url = URL.createObjectURL(file);
    durationRef.current = null;
    // Reject clips outside HeyGen's training window before uploading — a single
    // 15–60s take works best.
    try {
      const dur = await probeDuration(url);
      durationRef.current = dur;
      if (Number.isFinite(dur) && (dur < MIN_DURATION_S || dur > MAX_DURATION_S)) {
        URL.revokeObjectURL(url);
        setClientError(
          `Clip is ${Math.round(dur)}s — it must be ${MIN_DURATION_S}–${MAX_DURATION_S}s. Record a single continuous 15–60s take.`,
        );
        return;
      }
    } catch {
      // Couldn't read metadata — let it through; HeyGen will validate server-side.
    }

    setClientError(null);
    setVideo(file);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }

  // Upload the video (+ optional voice clip) straight to Storage from the
  // browser, then hand the Server Action only the storage paths — keeping the
  // request body tiny and the video well under any function body-size limit.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);
    if (!video) return setClientError("Upload or record a video of yourself.");

    const form = e.currentTarget;
    const name =
      (form.elements.namedItem("name") as HTMLInputElement | null)?.value ||
      "My avatar";

    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setClientError("Your session expired. Please sign in again.");
        return;
      }

      // Big phone clips won't fit the Storage bucket, so transcode in-browser
      // to a small MP4 first. ffmpeg.wasm is heavy — only load it when needed.
      let toUpload = video;
      if (video.size > COMPRESS_TARGET_BYTES) {
        setPhase("compressing");
        setCompressPct(0);
        try {
          toUpload = await compressVideo(video, {
            durationSec: durationRef.current ?? 30,
            targetBytes: COMPRESS_TARGET_BYTES,
            onProgress: (f) => setCompressPct(Math.round(f * 100)),
          });
        } catch {
          setClientError(
            "Couldn't compress that video. Try a shorter clip (15–60s) or a smaller file.",
          );
          return;
        }
        // If it's somehow still too big, the bucket would reject it — bail clearly.
        if (toUpload.size > COMPRESS_TARGET_BYTES * 1.15) {
          setClientError(
            "That clip is too long to compress under the size limit — keep it to ~15–60s.",
          );
          return;
        }
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
      if (up.error) {
        setClientError(`Video upload failed: ${up.error.message}`);
        return;
      }

      const fd = new FormData();
      fd.set("photoPath", videoPath);
      fd.set("photoContentType", toUpload.type || "video/mp4");
      fd.set("name", name);
      formAction(fd);
    } catch {
      setClientError("Something went wrong during upload. Please try again.");
    } finally {
      setUploading(false);
      setPhase("idle");
    }
  }

  const pending = uploading || actionPending;
  const error = clientError ?? state?.error;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => uploadRef.current?.click()}
        className="flex aspect-square w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-foreground/40"
      >
        {preview ? (
          <video src={preview} className="size-full object-cover" muted playsInline autoPlay loop />
        ) : (
          <>
            <Video className="size-8" />
            <span className="text-sm font-medium text-foreground">
              Add a video of yourself
            </span>
            <span className="px-6 text-center text-xs">
              One clear 15–60s clip of you talking. We build a twin that looks
              and sounds like you from this video — no separate voice needed.
            </span>
          </>
        )}
      </button>

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => uploadRef.current?.click()}
        >
          <UploadCloud className="size-4" /> Upload video
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => recordRef.current?.click()}
        >
          <Video className="size-4" /> Record video
        </Button>
      </div>

      <input
        ref={uploadRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={recordRef}
        type="file"
        accept="video/*"
        capture="user"
        className="hidden"
        onChange={onPick}
      />

      <div className="grid gap-2">
        <label htmlFor="name" className="text-sm font-medium">Avatar name</label>
        <Input id="name" name="name" defaultValue="My avatar" />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending || !video}
        className="w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {pending ? (
          <>
            <Sparkles className="size-4 animate-pulse" />{" "}
            {phase === "compressing"
              ? `Compressing video… ${compressPct}%`
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
