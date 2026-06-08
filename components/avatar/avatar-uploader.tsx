"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Sparkles } from "lucide-react";
import { createAvatar, type AvatarState } from "@/app/(app)/onboarding/actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoiceInput } from "@/components/avatar/voice-input";

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_VIDEO_BYTES = 48 * 1024 * 1024; // under the 50MiB Storage bucket cap

export function AvatarUploader({ redirectTo = "/app" }: { redirectTo?: string }) {
  const router = useRouter();
  const [state, formAction, actionPending] = useActionState<AvatarState, FormData>(
    createAvatar,
    undefined,
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"image" | "video" | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) router.push(redirectTo);
  }, [state, router, redirectTo]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const kind = file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("image/")
        ? "image"
        : null;
    setPreviewKind(kind);
    setPreview(kind ? URL.createObjectURL(file) : null);
  }

  // Upload the photo (and optional voice clip) straight to Storage from the
  // browser, then hand the Server Action only the resulting paths — keeping the
  // request body tiny and avatars well under any function body-size limit.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);

    const form = e.currentTarget;
    const photo = inputRef.current?.files?.[0];
    if (!photo) return setClientError("Choose a photo or video of yourself.");
    const isVideo = photo.type.startsWith("video/");
    if (isVideo && photo.size > MAX_VIDEO_BYTES) {
      return setClientError("Video must be under 48MB — keep it to ~15–60s.");
    }
    if (!isVideo && photo.size > MAX_IMAGE_BYTES) {
      return setClientError("Photo must be under 32MB.");
    }

    const audio =
      (form.elements.namedItem("audio") as HTMLInputElement | null)?.files?.[0] ??
      null;
    if (audio && audio.size > MAX_IMAGE_BYTES) {
      return setClientError("Voice clip must be under 32MB.");
    }
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

      const photoExt = photo.name.split(".").pop() || "jpg";
      const photoPath = `${user.id}/${Date.now()}.${photoExt}`;
      const photoUpload = await supabase.storage
        .from("avatar-sources")
        .upload(photoPath, photo, { contentType: photo.type, upsert: true });
      if (photoUpload.error) {
        setClientError(`Photo upload failed: ${photoUpload.error.message}`);
        return;
      }

      let audioPath = "";
      if (audio) {
        const audioExt = audio.name.split(".").pop() || "wav";
        audioPath = `${user.id}/voice-${Date.now()}.${audioExt}`;
        const audioUpload = await supabase.storage
          .from("avatar-sources")
          .upload(audioPath, audio, { contentType: audio.type, upsert: true });
        if (audioUpload.error) {
          setClientError(`Voice upload failed: ${audioUpload.error.message}`);
          return;
        }
      }

      const fd = new FormData();
      fd.set("photoPath", photoPath);
      fd.set("photoContentType", photo.type || "image/jpeg");
      fd.set("name", name);
      if (audioPath) {
        fd.set("audioPath", audioPath);
        fd.set("audioContentType", audio?.type || "audio/wav");
      }
      formAction(fd);
    } catch {
      setClientError("Something went wrong during upload. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  const pending = uploading || actionPending;
  const error = clientError ?? state?.error;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex aspect-square w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-foreground/40"
      >
        {preview && previewKind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="size-full object-cover" />
        ) : preview && previewKind === "video" ? (
          <video src={preview} className="size-full object-cover" muted playsInline />
        ) : (
          <>
            <UploadCloud className="size-8" />
            <span className="text-sm">
              {fileName ?? "Tap to upload a photo or video"}
            </span>
            <span className="px-6 text-center text-xs">
              Photo → talking avatar. Video of you (15–60s) → realistic AI twin.
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={onFileChange}
      />

      <div className="grid gap-2">
        <Label htmlFor="name">Avatar name</Label>
        <Input id="name" name="name" defaultValue="My avatar" />
      </div>

      {/* Optional: clone the agent's voice — record in-app or upload a clip. */}
      <VoiceInput />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending || !fileName}
        className="w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {pending ? (
          <>
            <Sparkles className="size-4 animate-pulse" />{" "}
            {uploading ? "Uploading…" : "Creating your avatar…"}
          </>
        ) : (
          "Create my avatar"
        )}
      </Button>
    </form>
  );
}
