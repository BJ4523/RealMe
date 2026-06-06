import { cn } from "@/lib/utils";
import type { Enums } from "@/lib/types/database";

type VideoStatus = Enums<"video_status">;

const LABELS: Record<VideoStatus, string> = {
  pending_script: "Writing script",
  script_ready: "Script ready",
  submitting: "Submitting",
  processing: "Generating",
  completed: "Ready",
  failed: "Failed",
};

const STYLES: Record<VideoStatus, string> = {
  pending_script: "bg-muted text-muted-foreground",
  script_ready: "bg-secondary text-secondary-foreground",
  submitting: "bg-secondary text-secondary-foreground",
  processing: "bg-foreground text-background",
  completed: "bg-accent text-accent-foreground",
  failed: "bg-destructive text-white",
};

export function StatusBadge({
  status,
  className,
}: {
  status: VideoStatus;
  className?: string;
}) {
  const pulsing = status === "processing" || status === "submitting";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide",
        STYLES[status],
        className,
      )}
    >
      {pulsing ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {LABELS[status]}
    </span>
  );
}
