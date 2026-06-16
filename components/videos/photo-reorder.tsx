"use client";

import { useRef, useState, useTransition } from "react";
import { GripVertical, Home, Flag, Loader2, X, ImagePlus } from "lucide-react";
import { saveListingPhotos } from "@/app/(app)/videos/actions";
import { createClient } from "@/lib/supabase/client";

type Photo = { url: string; caption?: string };

const BUCKET = "listing-photos";
const safeName = (n: string) =>
  n.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Drag-and-drop reorder + delete + add for the listing photos used in video
 * generation. Photo order IS the tour sequence: first = opening (front exterior),
 * last = closing shot, interiors between = the room walk. Every change persists to
 * the listing (authoritative set), so the next Generate uses it. Native HTML5 DnD;
 * new photos upload straight to the public listing-photos bucket.
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const last = photos.length - 1;

  function persist(next: Photo[]) {
    setPhotos(next);
    startSave(async () => {
      const res = await saveListingPhotos(videoId, next.map((p) => p.url));
      if (res?.error) setError(res.error);
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

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0 || uploading) return;
    setError(null);
    setUploading(true);
    const supabase = createClient();
    const added: Photo[] = [];
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const path = `${user.id}/uploads/${crypto.randomUUID()}-${safeName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setError(upErr.message);
          continue;
        }
        added.push({ url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      if (added.length) persist([...photos, ...added]);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Tour order</div>
        <div className="text-xs text-muted-foreground">
          {saving || uploading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              {uploading ? "Uploading…" : "Saving…"}
            </span>
          ) : (
            "Drag to reorder · hover to delete · add your own"
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
                aria-label={`Delete photo ${i + 1}`}
                title="Delete photo"
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

        {/* Add-photos tile */}
        <li className="shrink-0">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addFiles(e.dataTransfer.files);
            }}
            aria-label="Add photos"
            className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-background text-muted-foreground transition hover:border-foreground hover:text-foreground"
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <ImagePlus className="size-4" />
                <span className="text-[10px]">Add</span>
              </>
            )}
          </button>
        </li>
      </ol>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void addFiles(e.target.files)}
      />
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
