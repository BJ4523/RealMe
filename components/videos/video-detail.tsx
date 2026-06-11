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
} from "lucide-react";
import { toast } from "sonner";
import {
  submitCinematicVideo,
  submitHypeReelVideo,
  updateScript,
  pollVideoStatus,
} from "@/app/(app)/videos/actions";
import type { Tables } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "./status-badge";

type Video = Tables<"videos">;

export function VideoDetail({
  initialVideo,
  cinematicReady = false,
  hasTwin = false,
  tracks = [],
}: {
  initialVideo: Video;
  /** True when the active twin is consent-verified — unlocks cinematic mode. */
  cinematicReady?: boolean;
  /** True when the active avatar is a ready digital twin (consent may still be pending). */
  hasTwin?: boolean;
  /** Hype Reel music tracks the agent can pick from. */
  tracks?: { id: string; title: string; previewUrl: string }[];
}) {
  const [video, setVideo] = useState<Video>(initialVideo);
  const [script, setScript] = useState(initialVideo.script ?? "");
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? "");
  const [previewing, setPreviewing] = useState(false);
  const [pending, startTransition] = useTransition();
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

  function handleCinematic() {
    startTransition(async () => {
      await updateScript(video.id, script);
      setVideo((v) => ({ ...v, status: "submitting" }));
      await submitCinematicVideo(video.id);
      const latest = await pollVideoStatus(video.id);
      if (latest) setVideo(latest);
    });
  }

  function handleHypeReel() {
    startTransition(async () => {
      await updateScript(video.id, script);
      setVideo((v) => ({ ...v, status: "submitting" }));
      await submitHypeReelVideo(video.id, trackId);
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
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold">Narration script</h2>
            <span className="text-xs text-muted-foreground">
              Edit before generating
            </span>
          </div>
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={8}
            className="rounded-2xl"
          />
          <div className="flex flex-wrap items-center justify-end gap-3">
            {cinematicReady ? (
              <>
                {/* Digital-twin walkthrough is the only generation path. No
                    presenter / avatar-over-photos anywhere. */}
                <Button
                  onClick={handleCinematic}
                  disabled={pending || !script.trim()}
                  size="lg"
                  variant="outline"
                  className="rounded-full"
                  title="Your real listing photos with cinematic motion + your twin"
                >
                  <Film className="size-5" />
                  {pending ? "Working…" : "Cinematic walkthrough"}
                </Button>
                {tracks.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      onClick={togglePreview}
                      size="icon"
                      variant="outline"
                      className="size-9 rounded-full"
                      aria-label={previewing ? "Pause preview" : "Preview track"}
                      title="Preview the beat"
                    >
                      {previewing ? (
                        <Pause className="size-4" />
                      ) : (
                        <Play className="size-4" />
                      )}
                    </Button>
                    <select
                      value={trackId}
                      onChange={(e) => setTrackId(e.target.value)}
                      className="rounded-full border border-border bg-background px-3 py-2 text-sm"
                      aria-label="Hype Reel music track"
                    >
                      {tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                    <audio
                      ref={audioRef}
                      src={currentTrack?.previewUrl}
                      onEnded={() => setPreviewing(false)}
                      preload="none"
                      className="hidden"
                    />
                  </div>
                ) : null}
                <Button
                  onClick={handleHypeReel}
                  disabled={pending || !script.trim()}
                  size="lg"
                  className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
                  title="On-camera twin host + beat-synced tour of your real photos, set to music"
                >
                  <Film className="size-5" />
                  {pending ? "Working…" : "Hype reel"}
                </Button>
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

      {/* Retry on failure */}
      {video.status === "failed" ? (
        <div className="flex flex-col gap-3">
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={6}
            className="rounded-2xl"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleCinematic}
              disabled={pending || !cinematicReady}
              className="rounded-full"
              variant="outline"
            >
              <RotateCcw className="size-4" /> Try again
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
