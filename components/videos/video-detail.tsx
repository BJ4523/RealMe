"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Clapperboard,
  Film,
  Download,
  Share2,
  Sparkles,
  RotateCcw,
  Play,
  Pause,
  Captions,
} from "lucide-react";
import { toast } from "sonner";
import {
  submitCinematicVideo,
  submitHypeReelVideo,
} from "@/app/(app)/videos/actions";
import { submitAiReel } from "@/app/(app)/videos/ai-actions";
import {
  updateScript,
  pollVideoStatus,
  rewriteOpeningPitch,
  retryVideo,
} from "@/app/(app)/videos/actions";
import type { Tables } from "@/lib/types/database";
import { WARDROBES } from "@/lib/video/wardrobe";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "./status-badge";
import { PhotoReorder } from "./photo-reorder";

type Video = Tables<"videos">;

export function VideoDetail({
  initialVideo,
  cinematicReady = false,
  hasTwin = false,
  aiReady = false,
  photos = [],
  tracks = [],
}: {
  initialVideo: Video;
  /** True when the active twin is consent-verified — unlocks cinematic mode. */
  cinematicReady?: boolean;
  /** True when the active avatar is a ready digital twin (consent may still be pending). */
  hasTwin?: boolean;
  /** True when the AI avatar (Runway photo + ElevenLabs voice) is set up. */
  aiReady?: boolean;
  /** Listing photos in tour order (first = opener, last = closer) — reorderable. */
  photos?: { url: string; caption?: string }[];
  /** Hype Reel music tracks the agent can pick from. */
  tracks?: { id: string; title: string; previewUrl: string }[];
}) {
  const [video, setVideo] = useState<Video>(initialVideo);
  const [script, setScript] = useState(initialVideo.script ?? "");
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? "");
  const [outfitId, setOutfitId] = useState(WARDROBES[0].id);
  // Default to the RECOMMENDED room count = all interior photos (capped at 12);
  // the dropdown is a manual override.
  const [roomCount, setRoomCount] = useState(() =>
    Math.min(12, Math.max(1, photos.length - 2)),
  );
  const [captions, setCaptions] = useState(false);
  const [tucked, setTucked] = useState(true);
  const [mode, setMode] = useState<"cinematic" | "hype" | "genz" | "ai">(
    "cinematic",
  );
  const [length, setLength] = useState<"short" | "standard" | "long">("standard");
  const [previewing, setPreviewing] = useState(false);

  // Rooms come from the INTERIOR photos (between the opening + closing shots), so
  // never offer more rooms than the listing actually has photos for.
  const maxRooms = Math.min(12, Math.max(1, photos.length - 2));
  const effRooms = Math.min(roomCount, maxRooms);
  // Length picker → words per room line → clip seconds (clip ≈ words / 2.5).
  const roomWords = length === "short" ? 8 : length === "long" ? 22 : 14;
  const perRoomSec = Math.min(15, Math.max(4, Math.round(roomWords / 2.5)));
  // Rough total: opener + rooms + ~4s closer. Cinematic/Gen-Z open with the ~15s
  // pitch; Hype opens with a punchy ~5s hook and is floored at 15s.
  const openerSec = mode === "hype" ? 5 : 15;
  const estSecs = Math.max(
    mode === "hype" ? 15 : 0,
    openerSec + effRooms * perRoomSec + 4,
  );
  const [pending, startTransition] = useTransition();
  const [rewriting, startRewrite] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrack = tracks.find((t) => t.id === trackId) ?? tracks[0];

  // Stop preview playback whenever the selected track changes.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPreviewing(false);
  }, [trackId]);

  function togglePreview() {
    const el = audioRef.current;
    if (!el) return;
    if (previewing) {
      el.pause();
      setPreviewing(false);
    } else {
      void el.play();
      setPreviewing(true);
    }
  }

  const isWorking =
    video.status === "processing" || video.status === "submitting";

  // Poll while the job is in flight.
  useEffect(() => {
    if (!isWorking) return;
    pollRef.current = setInterval(async () => {
      const latest = await pollVideoStatus(video.id);
      if (latest) setVideo(latest);
    }, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isWorking, video.id]);

  function handleRewrite() {
    startRewrite(async () => {
      const { pitch, error } = await rewriteOpeningPitch(video.id);
      if (error) {
        toast.error(error);
        return;
      }
      if (pitch) {
        setScript(pitch);
        toast.success("Pitch rewritten");
      }
    });
  }

  // Retry a failed reel by reusing the already-rendered clips (no new credits).
  // Flip to the generating UI IMMEDIATELY (urgent update, outside the transition)
  // so it doesn't wait on the server round-trip; the poll loop drives the rest.
  function handleRetry() {
    setVideo((v) => ({ ...v, status: "processing", error: null }));
    startTransition(async () => {
      const latest = await retryVideo(video.id);
      if (latest) setVideo(latest);
    });
  }

  function handleGenerate(forceMode?: "cinematic" | "hype" | "genz" | "ai") {
    const m = forceMode ?? mode;
    setVideo((v) => ({ ...v, status: "submitting" }));
    startTransition(async () => {
      await updateScript(video.id, script);
      if (m === "ai") {
        // Runway + ElevenLabs pipeline (real footage + expressive VO, no lipsync).
        await submitAiReel(video.id, { roomCount: effRooms, style: "classic" });
      } else if (m === "hype") {
        await submitHypeReelVideo(
          video.id,
          trackId,
          outfitId,
          captions,
          tucked,
          "classic",
          roomWords,
          effRooms,
        );
      } else {
        // Cinematic (classic voice) or Gen Z (cinematic walking tour, hyped slang).
        await submitCinematicVideo(
          video.id,
          outfitId,
          effRooms,
          captions,
          tucked,
          m === "genz" ? "genz" : "classic",
          roomWords,
        );
      }
      const latest = await pollVideoStatus(video.id);
      if (latest) setVideo(latest);
    });
  }

  function handleShare() {
    const url = `${window.location.origin}/videos/${video.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <StatusBadge status={video.status} />
        {video.duration ? (
          <span className="font-mono text-xs text-muted-foreground">
            {Math.round(Number(video.duration))}s
          </span>
        ) : null}
      </div>

      {/* Player / progress surface */}
      {/* Walkthroughs render 9:16 (vertical), so frame the player as portrait
          and center it — otherwise a 16:9 box pillarboxes it with black bars. */}
      <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-3xl border border-border bg-foreground">
        {video.status === "completed" && video.video_url ? (
          <video
            src={video.video_url}
            poster={video.thumbnail_url ?? undefined}
            controls
            playsInline
            className="aspect-[9/16] w-full bg-black object-cover"
          />
        ) : (
          <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-4 text-background">
            {video.status === "failed" ? (
              <p className="text-destructive">
                {video.error ?? "Generation failed."}
              </p>
            ) : isWorking ? (
              <>
                <div className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Sparkles className="size-7 animate-pulse" />
                </div>
                <p className="font-mono text-xs uppercase tracking-widest text-background/70">
                  Generating your video…
                </p>
              </>
            ) : (
              <>
                <Clapperboard className="size-10 text-background/60" />
                <p className="font-mono text-xs uppercase tracking-widest text-background/70">
                  Review the script, then generate
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Completed actions */}
      {video.status === "completed" && video.video_url ? (
        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
          >
            <a href={video.video_url} download target="_blank" rel="noreferrer">
              <Download className="size-4" /> Download
            </a>
          </Button>
          <Button onClick={handleShare} variant="outline" className="rounded-full">
            <Share2 className="size-4" /> Share link
          </Button>
        </div>
      ) : null}

      {/* Script editor (pre-generation) */}
      {(video.status === "script_ready" ||
        video.status === "pending_script") && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-bold">Opening pitch</h2>
            <Button
              type="button"
              onClick={handleRewrite}
              disabled={rewriting}
              size="sm"
              variant="outline"
              className="rounded-full"
              title="Regenerate the ~20s pitch with AI"
            >
              <Sparkles className={`size-4 ${rewriting ? "animate-pulse" : ""}`} />
              {rewriting ? "Rewriting…" : "Rewrite with AI"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Spoken in front of the house · AI-written for ~20s — edit, or hit
            Rewrite for a fresh take.
          </p>
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={8}
            className="rounded-2xl"
            disabled={rewriting}
          />
          {(() => {
            const words = script.trim() ? script.trim().split(/\s+/).length : 0;
            const secs = Math.round((words / 2.5) * 10) / 10; // ~150 wpm
            const onTarget = secs >= 16 && secs <= 22;
            return (
              <p
                className={`text-xs ${onTarget ? "text-muted-foreground" : "text-amber-600"}`}
              >
                {words} words · ~{secs}s spoken
                {onTarget ? " · on target" : " · aim for ~20s (≈50 words)"}
              </p>
            );
          })()}
          {photos.length >= 1 && (
            <PhotoReorder videoId={video.id} photos={photos} />
          )}
          <div className="flex flex-col gap-4">
            {cinematicReady ? (
              <>
                {/* Settings row — applies to whichever video you generate. */}
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span>Outfit</span>
                    <Select value={outfitId} onValueChange={setOutfitId}>
                      <SelectTrigger
                        size="sm"
                        aria-label="Agent outfit"
                        className="w-auto rounded-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Men&apos;s</SelectLabel>
                          {WARDROBES.filter((w) => w.gender === "men").map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Women&apos;s</SelectLabel>
                          {WARDROBES.filter((w) => w.gender === "women").map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Shirt tuck — pinned into every shot so it stays consistent. */}
                  <button
                    type="button"
                    onClick={() => setTucked((t) => !t)}
                    aria-pressed={tucked}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors ${
                      tucked
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                    title="Whether the agent's shirt is tucked in or worn untucked"
                  >
                    Shirt {tucked ? "tucked" : "untucked"}
                  </button>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span>Rooms</span>
                    <Select
                      value={String(effRooms)}
                      onValueChange={(v) => setRoomCount(Number(v))}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label="Number of rooms"
                        className="w-auto rounded-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: maxRooms }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                            {n === maxRooms ? " · all rooms (recommended)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Length picker — per-room pacing (drives total duration). */}
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span>Length</span>
                    <Select
                      value={length}
                      onValueChange={(v) => setLength(v as typeof length)}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label="Video length / pace"
                        className="w-auto rounded-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short &amp; snappy</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="long">Detailed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Captions toggle (on = burned, muted-friendly). */}
                  <button
                    type="button"
                    onClick={() => setCaptions((c) => !c)}
                    aria-pressed={captions}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors ${
                      captions
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                    title="Burn captions onto the video (great for muted social feeds)"
                  >
                    <Captions className="size-4" />
                    Captions {captions ? "on" : "off"}
                  </button>
                  {mode === "hype" && tracks.length > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-muted-foreground">Music</span>
                      <Button
                        type="button"
                        onClick={togglePreview}
                        size="icon"
                        variant="outline"
                        className="size-9 rounded-full"
                        aria-label={previewing ? "Pause preview" : "Preview track"}
                        title="Preview the beat (Hype reel music)"
                      >
                        {previewing ? (
                          <Pause className="size-4" />
                        ) : (
                          <Play className="size-4" />
                        )}
                      </Button>
                      <Select value={trackId} onValueChange={setTrackId}>
                        <SelectTrigger
                          size="sm"
                          aria-label="Hype Reel music track"
                          className="w-auto rounded-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {tracks.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <audio
                        ref={audioRef}
                        src={currentTrack?.previewUrl}
                        onEnded={() => setPreviewing(false)}
                        preload="none"
                        className="hidden"
                      />
                    </div>
                  ) : null}
                </div>

                {/* Pick ONE mode, then Generate. */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div
                      role="radiogroup"
                      aria-label="Video mode"
                      className="inline-flex rounded-full border border-border bg-background p-1"
                    >
                      {(
                        [
                          { id: "cinematic", label: "Cinematic" },
                          { id: "hype", label: "Hype reel" },
                          { id: "genz", label: "Gen Z 🔥" },
                          ...(aiReady ? [{ id: "ai", label: "AI ✨" }] : []),
                        ] as { id: "cinematic" | "hype" | "genz" | "ai"; label: string }[]
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={mode === m.id}
                          onClick={() => setMode(m.id)}
                          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                            mode === m.id
                              ? "bg-foreground text-background"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 px-1 text-xs text-muted-foreground">
                      {mode === "cinematic"
                        ? "Faithful walking tour of your photos, polished voice."
                        : mode === "hype"
                          ? "Same tour set to music — punchy and social."
                          : mode === "genz"
                            ? "Walking tour with hyped, Gen-Z slang narration."
                            : "Realistic Runway footage + your cloned ElevenLabs voice, lip-synced."}{" "}
                      {mode !== "ai" && (
                        <span className="font-medium text-foreground">≈ {estSecs}s</span>
                      )}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleGenerate()}
                    disabled={pending || !script.trim()}
                    size="lg"
                    className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
                  >
                    <Film className="size-5" />
                    {pending ? "Working…" : "Generate"}
                  </Button>
                </div>
              </>
            ) : hasTwin ? (
              // Twin exists but isn't consent-verified. Walkthroughs require it —
              // route to verification rather than falling back to a presenter video.
              <Button
                asChild
                size="lg"
                className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
              >
                <Link href="/settings/avatar">
                  <Film className="size-5" /> Verify your twin to generate
                </Link>
              </Button>
            ) : (
              // No twin yet — every video stars the digital twin, so send them to set one up.
              <Button
                asChild
                size="lg"
                className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
              >
                <Link href="/settings/avatar">
                  <Film className="size-5" /> Create your digital twin to generate
                </Link>
              </Button>
            )}
          </div>
          {cinematicReady ? (
            <p className="text-right text-xs text-muted-foreground">
              Every video is a digital-twin walkthrough of your real listing photos
              with cinematic motion. “Hype reel” adds your on-camera twin host and a
              music track. (No avatar-pasted-over-photo videos.)
            </p>
          ) : hasTwin ? (
            <p className="text-right text-xs text-muted-foreground">
              Your twin needs a one-time identity verification before it can star in
              a walkthrough.{" "}
              <Link href="/settings/avatar" className="underline">
                Verify now
              </Link>
              .
            </p>
          ) : (
            <p className="text-right text-xs text-muted-foreground">
              <Link href="/settings/avatar" className="underline">
                Create a digital twin
              </Link>{" "}
              to generate walkthrough videos.
            </p>
          )}
        </div>
      )}

      {/* Retry on failure. Primary path REUSES the rendered clips (no new clip
          credits) — fixes transient assembly failures like ENOSPC. "Start over"
          regenerates from scratch (type-aware) if the clips themselves failed. */}
      {video.status === "failed" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            The clips are saved — Retry finishes the video without re-rendering them.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              onClick={() =>
                handleGenerate(
                  video.heygen_video_id?.startsWith("reel:") ? "hype" : "cinematic",
                )
              }
              disabled={pending || !cinematicReady}
              className="rounded-full"
              variant="ghost"
            >
              Start over
            </Button>
            <Button
              onClick={handleRetry}
              disabled={pending}
              className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
            >
              <RotateCcw className="size-4" /> {pending ? "Retrying…" : "Retry"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
