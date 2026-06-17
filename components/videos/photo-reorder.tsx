"use client";

import { useState, useTransition } from "react";
import { GripVertical, Home, Flag, Loader2, X, Plus, Check } from "lucide-react";
import { saveTourOrder } from "@/app/(app)/videos/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Photo = { url: string; caption?: string };

/**
 * Drag-and-drop reorder + delete + add for THIS video's tour order — an ordered
 * selection drawn from the listing's photos. Photo order IS the tour sequence:
 * first = opening (front exterior), last = closing shot, interiors between = the
 * room walk. "Add" opens a modal of the listing's photos to pull from (a photo may
 * appear more than once). Persists to the VIDEO; the listing's photo set is never
 * mutated. Native HTML5 DnD.
 */
export function PhotoReorder({
  videoId,
  photos: initial,
  listingPool = [],
}: {
  videoId: string;
  photos: Photo[];
  listingPool?: Photo[];
}) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, startSave] = useTransition();

  const last = photos.length - 1;
  const countInTour = (url: string) => photos.filter((p) => p.url === url).length;

  function persist(next: Photo[]) {
    setPhotos(next);
    startSave(async () => {
      await saveTourOrder(videoId, next.map((p) => p.url));
    });
  }

  function move(from: number, to: number) {
    if (from === to) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next);
  }

  function remove(i: number) {
    if (photos.length <= 1) return; // keep at least one
    persist(photos.filter((_, idx) => idx !== i));
  }

  function add(p: Photo) {
    persist([...photos, { url: p.url, caption: p.caption }]);
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Tour order</div>
        <div className="text-xs text-muted-foreground">
          {saving ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" /> Saving…
            </span>
          ) : (
            "Drag to reorder · hover to delete · add from your listing"
          )}
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Photo order is the video order. Put the{" "}
        <span className="font-medium text-foreground">front exterior first</span>{" "}
        (the opening shot) and the photo you want to{" "}
        <span className="font-medium text-foreground">end on last</span> (e.g. the
        backyard). The photos in between become the room-by-room walk.
      </p>

      <ol className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <li
            key={`${p.url}-${i}`}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragEnter={() => setOverIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null) move(dragIdx, i);
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDragEnd={() => {
              setDragIdx(null);
              setOverIdx(null);
            }}
            className={`group relative shrink-0 cursor-grab active:cursor-grabbing ${
              overIdx === i && dragIdx !== i ? "ring-2 ring-foreground" : ""
            } ${dragIdx === i ? "opacity-40" : ""} rounded-lg`}
            title="Drag to reorder"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={p.caption ?? `Photo ${i + 1}`}
              className="h-24 w-20 rounded-lg border border-border object-cover"
              draggable={false}
            />
            <span className="absolute left-1 top-1 rounded bg-background/80 px-1 text-[10px] font-medium text-muted-foreground">
              {i + 1}
            </span>
            {photos.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove photo ${i + 1} from tour`}
                title="Remove from tour"
                className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-background/90 text-foreground opacity-0 shadow transition-opacity hover:bg-destructive hover:text-white group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            )}
            <GripVertical className="pointer-events-none absolute bottom-7 right-1 size-3.5 text-background opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
            {i === 0 && (
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 rounded-b-lg bg-foreground/85 py-0.5 text-[10px] font-medium text-background">
                <Home className="size-3" /> Opening
              </span>
            )}
            {i === last && i !== 0 && (
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 rounded-b-lg bg-foreground/85 py-0.5 text-[10px] font-medium text-background">
                <Flag className="size-3" /> Ending
              </span>
            )}
          </li>
        ))}

        {/* Add-from-listing tile → opens the picker modal */}
        <li className="shrink-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Add a photo from your listing"
            className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-background text-muted-foreground transition hover:border-foreground hover:text-foreground"
          >
            <Plus className="size-4" />
            <span className="text-[10px]">Add</span>
          </button>
        </li>
      </ol>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add from your listing photos</DialogTitle>
            <DialogDescription>
              Tap a photo to add it to the tour. You can add the same photo more than
              once (e.g. feature a room at the start and the end).
            </DialogDescription>
          </DialogHeader>

          {listingPool.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              This listing has no photos yet. Add photos to the listing first.
            </p>
          ) : (
            <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
              {listingPool.map((p) => {
                const n = countInTour(p.url);
                return (
                  <button
                    key={p.url}
                    type="button"
                    onClick={() => add(p)}
                    className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-border ring-foreground transition hover:ring-2"
                    title={n ? `In tour ×${n} — tap to add again` : "Add to tour"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption ?? "Listing photo"}
                      className="size-full object-cover"
                    />
                    {n > 0 && (
                      <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-foreground/85 px-1.5 py-0.5 text-[10px] font-medium text-background">
                        <Check className="size-2.5" /> {n > 1 ? `×${n}` : "In tour"}
                      </span>
                    )}
                    <span className="absolute inset-0 grid place-items-center bg-foreground/0 text-background opacity-0 transition group-hover:bg-foreground/30 group-hover:opacity-100">
                      <Plus className="size-5" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <span className="mr-auto self-center text-xs text-muted-foreground">
              {photos.length} photo{photos.length === 1 ? "" : "s"} in tour
            </span>
            <Button type="button" onClick={() => setOpen(false)} className="rounded-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
