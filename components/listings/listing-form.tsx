"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createListing, type ListingFormState } from "@/app/(app)/listings/actions";
import type { ListingDraft } from "@/lib/listings/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
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

      <div className="grid gap-2">
        <Label htmlFor="photos">Photo URLs (one per line)</Label>
        <Textarea
          id="photos"
          name="photos"
          rows={3}
          defaultValue={draft?.photos?.map((p) => p.url).join("\n")}
          placeholder={"https://…/photo-1.jpg\nhttps://…/photo-2.jpg"}
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
