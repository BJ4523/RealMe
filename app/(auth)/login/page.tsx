"use client";

import { useActionState, use } from "react";
import { useFormStatus } from "react-dom";
import { Mail, CheckCircle2 } from "lucide-react";
import { sendMagicLink, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
    >
      <Mail className="size-4" />
      {pending ? "Sending…" : "Email me a magic link"}
    </Button>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = use(searchParams);
  const [state, formAction] = useActionState<AuthState, FormData>(
    sendMagicLink,
    undefined,
  );

  if (state?.sent) {
    return (
      <Card className="rounded-3xl text-center">
        <CardContent className="flex flex-col items-center gap-3 pt-8 pb-8">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/30">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="font-heading text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a magic link to{" "}
            <span className="font-medium text-foreground">{state.email}</span>.
            Click it to sign in.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">Sign in to RealMe</CardTitle>
        <CardDescription>
          No password — we&apos;ll email you a one-tap magic link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={params.next ?? "/app"} />
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@brokerage.com"
            />
          </div>
          {state?.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
