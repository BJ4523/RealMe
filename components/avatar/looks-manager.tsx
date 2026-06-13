"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  startLookGeneration,
  refreshLooks,
} from "@/app/(app)/settings/avatar/looks-actions";
import { parseLooks, type LooksState } from "@/lib/avatars/looks-state";
import { WARDROBES } from "@/lib/video/wardrobe";
import { Button } from "@/components/ui/button";

/**
 * "Looks" — canonical outfit images of the twin that drive video generation
 * (the chosen look's id powers the Seedance scenes; its image powers the
 * talking bookends, so the outfit + face stay consistent). Generate per outfit;
 * only READY looks appear in the video-generation step.
 */
export function LooksManager({ initialLooks }: { initialLooks: unknown }) {
  const [state, setState] = useState<LooksState>(() => parseLooks(initialLooks));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const inFlight = Object.values(state.items).some(
    (i) => i.status === "generating",
  );

  useEffect(() => {
    if (!inFlight) return;
    pollRef.current = setInterval(async () => {
      const res = await refreshLooks();
      if (res.state) setState(res.state);
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [inFlight]);

  function run(fn: () => Promise<{ state?: LooksState; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      if (res.state) setState(res.state);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-bold">Looks</h2>
        <p className="text-sm text-muted-foreground">
          Generate outfit looks of your twin — videos are built from the look you
          pick, so the outfit and face stay consistent in every scene. Each look
          takes a few minutes to generate.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {WARDROBES.map((w) => {
          const item = state.items[w.id];
          return (
            <div
              key={w.id}
              className="flex flex-col gap-2 rounded-2xl border border-border p-3"
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
                {item?.status === "ready" && item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={w.label}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover"
                  />
                ) : item?.status === "generating" ? (
                  <div className="flex size-full items-center justify-center">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
                    {w.label}
                  </div>
                )}
              </div>
              <p className="truncate text-xs font-medium">{w.label}</p>
              {item?.status === "failed" ? (
                <p
                  className="truncate text-xs text-destructive"
                  title={item.error}
                >
                  {item.error ?? "Failed"}
                </p>
              ) : null}
              <Button
                size="sm"
                variant={item?.status === "ready" ? "outline" : "default"}
                disabled={pending || item?.status === "generating"}
                onClick={() => run(() => startLookGeneration(w.id))}
                className="rounded-full"
              >
                {item?.status === "ready" ? (
                  <>
                    <RefreshCw className="size-3.5" /> Regenerate
                  </>
                ) : item?.status === "generating" ? (
                  "Generating…"
                ) : (
                  "Generate look"
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
