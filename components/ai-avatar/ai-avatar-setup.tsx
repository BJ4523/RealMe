"use client";

import { useRef, useState } from "react";
import { Loader2, ImagePlus, Mic, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { setupAiAvatar } from "@/app/(app)/videos/ai-actions";

const BUCKET = "listing-photos"; // public bucket → Runway/ElevenLabs can fetch
const safe = (n: string) =>
  n.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * One-time setup for the Runway + ElevenLabs pipeline: upload the agent's
 * reference PHOTO (Runway likeness) and a VOICE sample (ElevenLabs clones it).
 * Both upload to the public bucket, then setupAiAvatar persists the photo URL and
 * the cloned voice id on the active avatar.
 */
export function AiAvatarSetup({ ready = false }: { ready?: boolean }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "photo" | "voice" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(ready);
  const photoRef = useRef<HTMLInputElement>(null);
  const voiceRef = useRef<HTMLInputElement>(null);

  async function upload(file: File, kind: "photo" | "voice") {
    setError(null);
    setBusy(kind);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const path = `${user.id}/ai-avatar/${kind}-${crypto.randomUUID()}-${safe(file.name)}`;
      const { error: e } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
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
        A clear photo of you (full-body or chest-up, good light) for the on-camera
        look, and a 30–60s voice clip for your cloned voice. Used to render realistic
        walking tours with an expressive voiceover.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy === "photo"}
          onClick={() => photoRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-background px-4 py-6 text-sm transition hover:border-foreground"
        >
          {busy === "photo" ? (
            <Loader2 className="size-5 animate-spin" />
          ) : photoUrl ? (
            <Check className="size-5 text-foreground" />
          ) : (
            <ImagePlus className="size-5" />
          )}
          {photoUrl ? "Photo uploaded" : "Upload agent photo"}
        </button>
        <button
          type="button"
          disabled={busy === "voice"}
          onClick={() => voiceRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-background px-4 py-6 text-sm transition hover:border-foreground"
        >
          {busy === "voice" ? (
            <Loader2 className="size-5 animate-spin" />
          ) : voiceUrl ? (
            <Check className="size-5 text-foreground" />
          ) : (
            <Mic className="size-5" />
          )}
          {voiceUrl ? "Voice uploaded" : "Upload voice clip"}
        </button>
      </div>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "photo")}
      />
      <input
        ref={voiceRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "voice")}
      />

      <Button
        type="button"
        onClick={save}
        disabled={!photoUrl || !voiceUrl || busy === "save"}
        className="mt-3 w-full rounded-full"
      >
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
