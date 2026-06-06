"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  updateProfile,
  type SettingsState,
} from "@/app/(app)/settings/actions";
import type { Tables } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
    >
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function ProfileForm({ profile }: { profile: Tables<"profiles"> | null }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    updateProfile,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) toast.success("Profile updated");
  }, [state]);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-5">
      <div className="grid gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" defaultValue={profile?.full_name ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="brokerage">Brokerage</Label>
        <Input
          id="brokerage"
          name="brokerage"
          defaultValue={profile?.brokerage ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={profile?.phone ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="mlsAgentId">MLS agent ID</Label>
        <Input
          id="mlsAgentId"
          name="mlsAgentId"
          defaultValue={profile?.mls_agent_id ?? ""}
          placeholder="Used to pull only your listings (RESO ListAgentMlsId)"
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div>
        <SaveButton />
      </div>
    </form>
  );
}
