"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteVideo } from "@/app/(app)/videos/actions";

/**
 * Delete a video with a confirm. Two variants: an "icon" overlay button for the
 * video card (stops the parent Link navigation), and a "full" labeled button for
 * the video detail page.
 */
export function DeleteVideoButton({
  videoId,
  variant = "icon",
  redirectTo,
}: {
  videoId: string;
  variant?: "icon" | "full";
  /** Where to go after delete (detail page → /videos). */
  redirectTo?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this video? This can't be undone.")) return;
    startTransition(async () => {
      await deleteVideo(videoId);
      toast.success("Video deleted");
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-4" />
        {pending ? "Deleting…" : "Delete"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      aria-label="Delete video"
      className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition-opacity hover:bg-destructive group-hover:opacity-100 disabled:opacity-50"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
