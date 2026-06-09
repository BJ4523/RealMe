"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Video,
  UploadCloud,
  Check,
  ShieldCheck,
  Clapperboard,
} from "lucide-react";
import { createAvatar, type AvatarState } from "@/app/(app)/onboarding/actions";
import { createClient } from "@/lib/supabase/client";
import { compressVideo } from "@/lib/video/compress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Clips at or below this upload as-is; larger ones are compressed in the browser
// to land under the 50MiB Storage bucket cap before upload.
const COMPRESS_TARGET_BYTES = 42 * 1024 * 1024;
const MAX_INPUT_BYTES = 1024 * 1024 * 1024; // 1GB sanity ceiling
// HeyGen rejects digital-twin footage outside this window.
const MIN_DURATION_S = 15;
const MAX_DURATION_S = 600;
// Consent clips must be short.
const MAX_CONSENT_S = 30;

/** The statement the agent reads aloud in the consent clip. */
const CONSENT_SCRIPT =
  "Hi, my name is [say your full name]. I consent to RealMe creating an AI digital avatar of my likeness and voice from this video, and to using it to generate videos on my behalf.";

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
 * Avatar = Digital Twin. Two captures:
 *  1. Footage — a 15–60s clip; HeyGen trains a realistic twin from it.
 *  2. Consent (optional) — a <30s clip reading the statement; unlocks cinematic
 *     (Seedance) by setting the twin's consent_status. Skip it for a
 *     presenter-only twin (still narrates the real listing photos).
 */
export function AvatarUploader({ redirectTo = "/app" }: { redirectTo?: string }) {
  const router = useRouter();
  const [state, formAction, actionPending] = useActionState<AvatarState, FormData>(
    createAvatar,
    undefined,
  );
  const [video, setVideo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState<File | null>(null);
  const [consentPreview, setConsentPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "compressing" | "uploading">("idle");
  const [compressPct, setCompressPct] = useState(0);
  const [clientError, setClientError] = useState<string | null>(null);
  const durationRef = useRef<number | null>(null);

  const footageInput = useRef<HTMLInputElement>(null);
  const footageRecord = useRef<HTMLInputElement>(null);
  const consentInput = useRef<HTMLInputElement>(null);
  const consentRecord = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) router.push(redirectTo);
  }, [state, router, redirectTo]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
      if (consentPreview) URL.revokeObjectURL(consentPreview);
    };
  }, [preview, consentPreview]);

  async function onPickFootage(e: React.ChangeEvent<HTMLInputElement>) {
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

  async function onPickConsent(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) return setClientError("Please choose a video file.");
    const url = URL.createObjectURL(file);
    try {
      const dur = await probeDuration(url);
      if (Number.isFinite(dur) && dur > MAX_CONSENT_S) {
        URL.revokeObjectURL(url);
        return setClientError(`Consent clip must be under ${MAX_CONSENT_S}s — yours is ${Math.round(dur)}s.`);
      }
    } catch {
      /* let it through */
    }
    setClientError(null);
    setConsent(file);
    setConsentPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return url;
    });
  }

  async function uploadClip(
    file: File,
    kind: "twin" | "consent",
    userId: string,
    durationSec: number,
  ): Promise<string> {
    let toUpload = file;
    if (file.size > COMPRESS_TARGET_BYTES) {
      setPhase("compressing");
      setCompressPct(0);
      toUpload = await compressVideo(file, {
        durationSec,
        targetBytes: COMPRESS_TARGET_BYTES,
        onProgress: (f) => setCompressPct(Math.round(f * 100)),
      });
    }
    setPhase("uploading");
    const supabase = createClient();
    const ext = toUpload.name.split(".").pop() || "mp4";
    const path = `${userId}/${kind}-${Date.now()}.${ext}`;
    const up = await supabase.storage
      .from("avatar-sources")
      .upload(path, toUpload, { contentType: toUpload.type || "video/mp4", upsert: true });
    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
    return path;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);
    if (!video) return setClientError("Add your footage first.");

    const name =
      (e.currentTarget.elements.namedItem("name") as HTMLInputElement | null)?.value ||
      "My avatar";

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setClientError("Your session expired. Please sign in again.");

      const videoPath = await uploadClip(video, "twin", user.id, durationRef.current ?? 30);
      let consentPath: string | null = null;
      if (consent) consentPath = await uploadClip(consent, "consent", user.id, 20);

      const fd = new FormData();
      fd.set("photoPath", videoPath);
      fd.set("photoContentType", video.type || "video/mp4");
      fd.set("name", name);
      if (consentPath) fd.set("consentPath", consentPath);
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-7">
      {/* Step 1 — footage */}
      <Step n={1} title="Record your footage" done={!!video}>
        <p className="mb-4 text-sm text-muted-foreground">
          One clear, continuous <strong className="text-foreground">15–60s</strong> clip of you
          talking to camera. We build a twin that looks and sounds like you — no separate voice
          needed.
        </p>
        <button
          type="button"
          onClick={() => footageInput.current?.click()}
          className="group flex aspect-square w-full max-w-[260px] flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-foreground/40"
        >
          {preview ? (
            <video src={preview} className="size-full object-cover" muted playsInline autoPlay loop />
          ) : (
            <>
              <Video className="size-8 transition-transform group-hover:scale-110" />
              <span className="text-sm font-medium text-foreground">Add a video of yourself</span>
            </>
          )}
        </button>
        <div className="mt-3 grid max-w-[260px] grid-cols-2 gap-3">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => footageInput.current?.click()}>
            <UploadCloud className="size-4" /> Upload
          </Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => footageRecord.current?.click()}>
            <Video className="size-4" /> Record
          </Button>
        </div>
      </Step>

      {/* Step 2 — consent (unlocks cinematic) */}
      <Step
        n={2}
        title="Consent clip"
        badge="Unlocks cinematic"
        done={!!consent}
        optional
      >
        <p className="mb-3 text-sm text-muted-foreground">
          A quick <strong className="text-foreground">under-30s</strong> clip of you reading the
          statement below. This verifies it&apos;s really you, which unlocks{" "}
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <Clapperboard className="size-3.5" /> cinematic
          </span>{" "}
          mode (your twin moving through scenes). Skip it for a presenter-only twin.
        </p>
        <blockquote className="mb-4 rounded-2xl border border-border bg-muted/50 p-4 text-sm italic leading-relaxed text-foreground">
          “{CONSENT_SCRIPT}”
        </blockquote>
        <button
          type="button"
          onClick={() => consentRecord.current?.click()}
          className="group flex aspect-video w-full max-w-[260px] flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-foreground/40"
        >
          {consentPreview ? (
            <video src={consentPreview} className="size-full object-cover" muted playsInline autoPlay loop />
          ) : (
            <>
              <ShieldCheck className="size-7 transition-transform group-hover:scale-110" />
              <span className="text-xs font-medium text-foreground">Record consent clip</span>
            </>
          )}
        </button>
        <div className="mt-3 grid max-w-[260px] grid-cols-2 gap-3">
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => consentInput.current?.click()}>
            <UploadCloud className="size-4" /> Upload
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => consentRecord.current?.click()}>
            <Video className="size-4" /> Record
          </Button>
        </div>
      </Step>

      {/* Hidden inputs */}
      <input ref={footageInput} type="file" accept="video/*" className="hidden" onChange={onPickFootage} />
      <input ref={footageRecord} type="file" accept="video/*" capture="user" className="hidden" onChange={onPickFootage} />
      <input ref={consentInput} type="file" accept="video/*" className="hidden" onChange={onPickConsent} />
      <input ref={consentRecord} type="file" accept="video/*" capture="user" className="hidden" onChange={onPickConsent} />

      <div className="grid gap-2">
        <label htmlFor="name" className="text-sm font-medium">Avatar name</label>
        <Input id="name" name="name" defaultValue="My avatar" className="max-w-xs" />
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
              ? `Compressing… ${compressPct}%`
              : phase === "uploading"
                ? "Uploading…"
                : "Creating your AI twin…"}
          </>
        ) : consent ? (
          "Create my twin + unlock cinematic"
        ) : (
          "Create my AI twin"
        )}
      </Button>
    </form>
  );
}

/** A numbered step card with a completion check. */
function Step({
  n,
  title,
  badge,
  optional,
  done,
  children,
}: {
  n: number;
  title: string;
  badge?: string;
  optional?: boolean;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
            done ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {done ? <Check className="size-4" /> : n}
        </span>
        <h3 className="font-heading text-base font-bold">{title}</h3>
        {badge ? (
          <span className="rounded-full bg-foreground px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-background">
            {badge}
          </span>
        ) : null}
        {optional ? <span className="text-xs text-muted-foreground">optional</span> : null}
      </div>
      <div className="pl-10">{children}</div>
    </section>
  );
}
