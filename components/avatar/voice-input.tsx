"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Mic, Square, RotateCcw, UploadCloud, Check, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { blobToMonoWavFile } from "@/lib/audio/wav";

const MIN_SECONDS = 5;
const TARGET_SECONDS = 30;
const MAX_SECONDS = 60;

const SCRIPT =
  "Hi, I'm a real estate agent and I'd love to show you around. " +
  "This home has incredible natural light, a spacious open kitchen, and a " +
  "backyard that's perfect for entertaining. Let me walk you through it.";

type Mode = "upload" | "record";

/**
 * Optional voice step for the avatar uploader: record a ~30s clip in-app or
 * upload one. Whatever the user provides is written into a hidden
 * `<input type="file" name="audio">`, so the existing `createAvatar` server
 * action consumes it unchanged. Recordings are re-encoded to mono WAV (the
 * format HeyGen's voice clone accepts reliably).
 */
export function VoiceInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileBtnRef = useRef<HTMLInputElement>(null);

  // Client-only feature detection, SSR-safe (server snapshot = false).
  const supported = useSyncExternalStore(
    () => () => {},
    () =>
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window.MediaRecorder !== "undefined",
    () => false,
  );
  const [mode, setMode] = useState<Mode>("upload");
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<{ url: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopTracks();
      if (clip) URL.revokeObjectURL(clip.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearClip() {
    setClip((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setError(null);
    if (inputRef.current) inputRef.current.files = new DataTransfer().files;
  }

  function attachFile(file: File, label: string) {
    const input = inputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    setClip((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { url: URL.createObjectURL(file), label };
    });
  }

  function pickMimeType(): string {
    const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
    for (const t of candidates) {
      if (window.MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  async function startRecording() {
    setError(null);
    clearClip();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => handleStop(recorder.mimeType || mimeType);

      recorder.start();
      setRecording(true);
      setElapsed(0);
      elapsedRef.current = 0;
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
        if (elapsedRef.current >= MAX_SECONDS) stopRecording();
      }, 1000);
    } catch {
      setError(
        "Microphone access was blocked. Allow it in your browser, or upload a clip instead.",
      );
      setMode("upload");
      stopTracks();
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    recorderRef.current?.stop(); // fires onstop → handleStop
  }

  async function handleStop(mimeType: string) {
    stopTracks();
    const seconds = elapsedRef.current;
    const blob = new Blob(chunksRef.current, {
      type: mimeType || "audio/webm",
    });
    chunksRef.current = [];

    if (seconds < MIN_SECONDS) {
      setError(`Recording was too short — aim for at least ${MIN_SECONDS}s.`);
      return;
    }

    setPreparing(true);
    try {
      const wav = await blobToMonoWavFile(blob, "voice.wav");
      attachFile(wav, `Recorded clip · ${formatTime(seconds)}`);
    } catch {
      setError("Couldn't process the recording. Try again or upload a clip.");
    } finally {
      setPreparing(false);
    }
  }

  function onUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    attachFile(file, file.name);
  }

  function switchMode(next: Mode) {
    if (recording) stopRecording();
    clearClip();
    setMode(next);
  }

  return (
    <div className="grid gap-2">
      <Label>Your voice (optional)</Label>

      {/* Hidden input the server action reads (name="audio"). Populated by
          either an upload or a converted recording. */}
      <input
        ref={inputRef}
        type="file"
        name="audio"
        accept="audio/*"
        className="hidden"
        tabIndex={-1}
      />

      {supported ? (
        <div className="flex gap-1 rounded-full border border-border bg-card p-1">
          <ModeTab active={mode === "record"} onClick={() => switchMode("record")}>
            Record
          </ModeTab>
          <ModeTab active={mode === "upload"} onClick={() => switchMode("upload")}>
            Upload
          </ModeTab>
        </div>
      ) : null}

      {mode === "record" && supported ? (
        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4">
          <p className="rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            Read this aloud (about {TARGET_SECONDS}s) in a quiet room:
            <span className="mt-1 block text-foreground">&ldquo;{SCRIPT}&rdquo;</span>
          </p>

          {recording ? (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="size-2 animate-pulse rounded-full bg-destructive" />
                Recording… {formatTime(elapsed)}
                <span className="text-xs text-muted-foreground">
                  / {formatTime(MAX_SECONDS)}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={stopRecording}
              >
                <Square className="size-3.5" /> Stop
              </Button>
            </div>
          ) : preparing ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Processing recording…
            </span>
          ) : clip ? (
            <div className="grid gap-2">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Check className="size-4 text-accent-foreground" /> {clip.label}
              </span>
              <audio src={clip.url} controls className="w-full" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={startRecording}
                className="justify-self-start"
              >
                <RotateCcw className="size-3.5" /> Re-record
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={startRecording}
              className="justify-self-start"
            >
              <Mic className="size-4" /> Start recording
            </Button>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => fileBtnRef.current?.click()}
            className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-foreground/40"
          >
            {clip ? (
              <Check className="size-4 shrink-0 text-accent-foreground" />
            ) : (
              <UploadCloud className="size-4 shrink-0" />
            )}
            <span className="truncate">
              {clip?.label ?? "Upload a ~30s voice clip to narrate in your voice"}
            </span>
          </button>
          <input
            ref={fileBtnRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={onUploadChange}
          />
          {clip ? (
            <audio src={clip.url} controls className="w-full" />
          ) : null}
        </>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Skip this and we&apos;ll use a natural stock voice.
      </p>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
