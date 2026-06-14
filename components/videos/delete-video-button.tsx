"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteVideo } from "@/app/(app)/videos/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Delete a video behind a styled confirm Dialog (not window.confirm). Two
 * variants: an "icon" overlay button for the video card (stops the parent Link
 * navigation), and a "full" labeled button for the video detail page.
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
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // The card wraps the trigger in a <Link>; keep clicks from navigating.
  function openDialog(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }

  function confirmDelete() {
    startTransition(async () => {
      await deleteVideo(videoId);
      setOpen(false);
      toast.success("Video deleted");
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <>
      {variant === "full" ? (
        <button
          type="button"
          onClick={openDialog}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
          Delete
        </button>
      ) : (
        <button
          type="button"
          onClick={openDialog}
          aria-label="Delete video"
          className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition-opacity hover:bg-destructive group-hover:opacity-100"
        >
          <Trash2 className="size-4" />
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete this video?</DialogTitle>
            <DialogDescription>
              This permanently removes the video. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                confirmDelete();
              }}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
