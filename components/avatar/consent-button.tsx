"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { startAvatarConsent } from "@/app/(app)/onboarding/actions";
import { Button } from "@/components/ui/button";

/**
 * Opens HeyGen's hosted consent RECORDER for the user's twin (the tokenized,
 * no-login "record from your webcam/phone" flow). The agent records the consent
 * clip there, HeyGen reroutes back here, and the page re-reads consent_status —
 * which unlocks cinematic. No Enterprise plan, no HeyGen account for the user.
 */
export function ConsentButton({ label = "Verify for cinematic" }: { label?: string }) {
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
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={go}
          disabled={pending}
          size="sm"
          className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
        >
          <ShieldCheck className="size-4" /> {pending ? "Opening…" : label}
        </Button>
        {opened ? (
          <Button
            type="button"
            onClick={() => router.refresh()}
            size="sm"
            variant="outline"
            className="rounded-full"
          >
            <RefreshCw className="size-4" /> Done recording — refresh
          </Button>
        ) : null}
      </div>
      {opened ? (
        <p className="text-xs text-muted-foreground">
          In the new tab: allow camera/mic, read the on-screen script, record, and
          submit. Then come back and hit refresh — cinematic unlocks once HeyGen
          validates it (usually under a minute).
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
