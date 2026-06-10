"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { importFromUrl } from "@/app/(app)/listings/actions";
import type { ListingDraft } from "@/lib/listings/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListingForm } from "./listing-form";

export function UrlImport() {
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<Partial<ListingDraft> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleImport() {
    setError(null);
    startTransition(async () => {
      const res = await importFromUrl(url);
      if (res.error) {
        setError(res.error);
        return;
      }
      setDraft(res.draft ?? null);
    });
  }

  if (draft) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl bg-accent/30 px-3 py-2 text-sm">
          We pulled what we could from the URL. Review the details and add or
          remove photos below before saving.
        </p>
        <ListingForm draft={draft} source="url" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="import-url">Listing URL (Zillow, Redfin, Realtor.com)</Label>
        <Input
          id="import-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.zillow.com/homedetails/…"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end">
        <Button
          onClick={handleImport}
          disabled={pending || !url}
          className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Reading…
            </>
          ) : (
            "Import listing"
          )}
        </Button>
      </div>
    </div>
  );
}
