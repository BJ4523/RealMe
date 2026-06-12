"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createListing, type ListingFormState } from "@/app/(app)/listings/actions";
import type { ListingDraft } from "@/lib/listings/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploader } from "./photo-uploader";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
    >
      {pending ? "Saving…" : "Save listing"}
    </Button>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? undefined}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

export function ListingForm({
  draft,
  source = "manual",
}: {
  draft?: Partial<ListingDraft>;
  source?: "manual" | "url";
}) {
  const [state, formAction] = useActionState<ListingFormState, FormData>(
    createListing,
    undefined,
  );

  const [photosText, setPhotosText] = useState(
    draft?.photos?.map((p) => p.url).join("\n") ?? "",
  );
  const photoUrls = photosText
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter(Boolean);
  // The agent taps to choose which scraped photos go in the video. Tracking the
  // EXCLUDED set means newly added photos default to selected automatically.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const selectedUrls = photoUrls.filter((u) => !deselected.has(u));
  function togglePhoto(url: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="source" value={source} />
      {draft?.sourceUrl ? (
        <input type="hidden" name="sourceUrl" value={draft.sourceUrl} />
      ) : null}

      <Field
        label="Address"
        name="address"
        defaultValue={draft?.address}
        placeholder="123 Maple Court"
        required
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City" name="city" defaultValue={draft?.city} />
        <Field label="State" name="state" defaultValue={draft?.state} />
        <Field label="ZIP" name="zip" defaultValue={draft?.zip} />
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field
          label="Price"
          name="price"
          defaultValue={draft?.price}
          placeholder="849000"
        />
        <Field label="Beds" name="beds" defaultValue={draft?.beds} />
        <Field label="Baths" name="baths" defaultValue={draft?.baths} />
        <Field label="Sqft" name="sqft" defaultValue={draft?.sqft} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Year built"
          name="yearBuilt"
          defaultValue={draft?.yearBuilt}
        />
        <Field
          label="Property type"
          name="propertyType"
          defaultValue={draft?.propertyType}
          placeholder="Single-family home"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={draft?.description ?? undefined}
          placeholder="Sun-filled open floor plan with a chef's kitchen…"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="features">Features (comma separated)</Label>
        <Input
          id="features"
          name="features"
          defaultValue={draft?.features?.join(", ")}
          placeholder="Pool, 2-car garage, Renovated kitchen"
        />
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="photos-pool">Photos</Label>
          {photoUrls.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {selectedUrls.length} of {photoUrls.length} selected — tap a photo to
              include / exclude it from the video
            </span>
          ) : null}
        </div>
        <PhotoUploader
          onUploaded={(urls) =>
            setPhotosText((prev) =>
              [prev, ...urls].filter(Boolean).join("\n"),
            )
          }
        />
        {photoUrls.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photoUrls.map((url) => {
              const on = !deselected.has(url);
              return (
                <button
                  type="button"
                  key={url}
                  onClick={() => togglePhoto(url)}
                  className={`relative aspect-square w-full overflow-hidden rounded-lg border transition ${
                    on
                      ? "border-accent ring-2 ring-accent"
                      : "border-border opacity-40 hover:opacity-70"
                  }`}
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 33vw, 25vw"
                    className="object-cover"
                  />
                  {on ? (
                    <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {/* Only the SELECTED photos are saved to the listing. */}
        <input type="hidden" name="photos" value={selectedUrls.join("\n")} />
        <Textarea
          id="photos-pool"
          rows={3}
          value={photosText}
          onChange={(e) => setPhotosText(e.target.value)}
          placeholder={"Or paste photo URLs, one per line\nhttps://…/photo-1.jpg"}
        />
      </div>

      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}
