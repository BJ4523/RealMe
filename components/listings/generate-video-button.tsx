"use client";

import { useFormStatus } from "react-dom";
import { Clapperboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Submit button for the "Generate video" form. Creating the video writes the
 * opening pitch (a Claude call) before redirecting, so show a pending state for
 * that ~2-3s instead of leaving the button looking idle.
 */
export function GenerateVideoButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      aria-busy={pending}
      className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
    >
      {pending ? (
        <>
          <Loader2 className="size-5 animate-spin" /> Setting up your video…
        </>
      ) : (
        <>
          <Clapperboard className="size-5" /> Generate video
        </>
      )}
    </Button>
  );
}
