"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { startAvatarConsent } from "@/app/(app)/onboarding/actions";
import { Button } from "@/components/ui/button";

/**
 * Opens HeyGen's hosted identity-consent recorder for the user's twin (required
 * before cinematic generation). The agent records the consent video in the new
 * tab, then returns here and reloads — the page re-reads consent_status.
 */
export function ConsentButton({
  label = "Verify identity",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  function go() {
    setError(null);
    startTransition(async () => {
      const res = await startAvatarConsent();
      if (res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
        setOpened(true);
      } else {
        setError(res.error ?? "Could not start verification.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={go}
          disabled={pending}
          variant="outline"
          size="sm"
          className="rounded-full"
        >
          <ShieldCheck className="size-4" /> {pending ? "Opening…" : label}
        </Button>
        {opened ? (
          <Button
            type="button"
            onClick={() => router.refresh()}
            size="sm"
            variant="ghost"
            className="rounded-full"
          >
            I&apos;ve recorded it — refresh
          </Button>
        ) : null}
      </div>
      {opened ? (
        <p className="text-xs text-muted-foreground">
          Finish the recording in the new tab (read the statement + the code),
          then come back and refresh.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
