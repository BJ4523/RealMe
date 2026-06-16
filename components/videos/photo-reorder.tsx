"use client";

import { useState, useTransition } from "react";
import { GripVertical, Home, Flag, Loader2 } from "lucide-react";
import { reorderListingPhotos } from "@/app/(app)/videos/actions";

type Photo = { url: string; caption?: string };

/**
 * Drag-and-drop reorder for the listing photos used in video generation. Photo
 * order IS the tour sequence: first = opening (front exterior), last = closing
 * shot, interiors between = the room walk. Reordering persists to the listing, so
 * the next Generate uses the new order. Native HTML5 DnD (no extra deps).
 */
export function PhotoReorder({
  videoId,
  photos: initial,
}: {
  videoId: string;
  photos: Photo[];
}) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [saving, startSave] = useTransition();

  if (photos.length < 2) return null;
  const last = photos.length - 1;

  function move(from: number, to: number) {
    if (from === to) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPhotos(next);
    startSave(async () => {
      await reorderListingPhotos(videoId, next.map((p) => p.url));
    });
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
            "Drag to reorder"
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
            key={p.url}
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
            <GripVertical className="absolute right-1 top-1 size-3.5 text-background drop-shadow opacity-0 transition-opacity group-hover:opacity-100" />
            {i === 0 && (
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 rounded-b-lg bg-foreground/85 py-0.5 text-[10px] font-medium text-background">
                <Home className="size-3" /> Opening
              </span>
            )}
            {i === last && (
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 rounded-b-lg bg-foreground/85 py-0.5 text-[10px] font-medium text-background">
                <Flag className="size-3" /> Ending
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
