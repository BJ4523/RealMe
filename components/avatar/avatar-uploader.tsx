"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { UploadCloud, Sparkles } from "lucide-react";
import { createAvatar, type AvatarState } from "@/app/(app)/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoiceInput } from "@/components/avatar/voice-input";

function SubmitButton({ hasFile }: { hasFile: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending || !hasFile}
      className="w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
    >
      {pending ? (
        <>
          <Sparkles className="size-4 animate-pulse" /> Creating your avatar…
        </>
      ) : (
        "Create my avatar"
      )}
    </Button>
  );
}

export function AvatarUploader({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState<AvatarState, FormData>(
    createAvatar,
    undefined,
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) router.push(redirectTo);
  }, [state, router, redirectTo]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (file.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex aspect-square w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-foreground/40"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="size-full object-cover" />
        ) : (
          <>
            <UploadCloud className="size-8" />
            <span className="text-sm">
              {fileName ?? "Tap to upload your photo"}
            </span>
            <span className="text-xs">JPG or PNG · up to 32MB</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      <div className="grid gap-2">
        <Label htmlFor="name">Avatar name</Label>
        <Input id="name" name="name" defaultValue="My avatar" />
      </div>

      {/* Optional: clone the agent's voice — record in-app or upload a clip. */}
      <VoiceInput />

      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <SubmitButton hasFile={!!fileName} />
    </form>
  );
}
