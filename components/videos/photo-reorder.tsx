"use client";

import { useState, useTransition } from "react";
import { GripVertical, Home, Flag, Loader2, X, Plus } from "lucide-react";
import { saveTourOrder } from "@/app/(app)/videos/actions";

type Photo = { url: string; caption?: string };

/**
 * Drag-and-drop reorder + delete + add for THIS video's tour order — an ordered
 * selection drawn from the listing's photos. Photo order IS the tour sequence:
 * first = opening (front exterior), last = closing shot, interiors between = the
 * room walk. Delete removes a photo from the tour (back into the listing pool);
 * "Add" pulls any listing photo not currently in the tour. Persists to the VIDEO
 * (the listing's full photo set is never mutated). Native HTML5 DnD.
 */
export function PhotoReorder({
  videoId,
  photos: initial,
  available: initialAvailable = [],
}: {
  videoId: string;
  photos: Photo[];
  available?: Photo[];
}) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [available, setAvailable] = useState<Photo[]>(initialAvailable);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, startSave] = useTransition();

  const last = photos.length - 1;

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
    const removed = photos[i];
    setAvailable((a) => [removed, ...a]); // back into the pool
    persist(photos.filter((_, idx) => idx !== i));
  }

  function addFromPool(p: Photo) {
    setAvailable((a) => a.filter((x) => x.url !== p.url));
    persist([...photos, p]);
    if (available.length <= 1) setPicking(false);
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

        {/* Add-from-listing tile (only when the listing has more photos) */}
        {available.length > 0 && (
          <li className="shrink-0">
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              aria-label="Add a photo from your listing"
              className={`flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed transition ${
                picking
                  ? "border-foreground text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              <Plus className="size-4" />
              <span className="text-[10px]">Add</span>
            </button>
          </li>
        )}
      </ol>

      {/* Picker: listing photos not currently in the tour */}
      {picking && available.length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-background p-2">
          <p className="mb-2 text-xs text-muted-foreground">
            Tap a listing photo to add it to the tour:
          </p>
          <div className="flex flex-wrap gap-2">
            {available.map((p) => (
              <button
                key={p.url}
                type="button"
                onClick={() => addFromPool(p)}
                className="relative shrink-0 rounded-lg ring-foreground transition hover:ring-2"
                title="Add to tour"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption ?? "Listing photo"}
                  className="h-16 w-14 rounded-lg border border-border object-cover"
                />
                <span className="absolute inset-0 grid place-items-center rounded-lg bg-foreground/0 text-background opacity-0 transition hover:bg-foreground/30 hover:opacity-100">
                  <Plus className="size-4" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
