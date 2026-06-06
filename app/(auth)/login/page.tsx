"use client";

import { useActionState, use } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { signIn, type AuthState } from "../actions";
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
      {pending ? "Signing in…" : "Log in"}
    </Button>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; checkEmail?: string }>;
}) {
  const params = use(searchParams);
  const [state, formAction] = useActionState<AuthState, FormData>(
    signIn,
    undefined,
  );

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">Welcome back</CardTitle>
        <CardDescription>Log in to your Real Me studio.</CardDescription>
      </CardHeader>
      <CardContent>
        {params.checkEmail ? (
          <p className="mb-4 rounded-xl bg-accent/30 px-3 py-2 text-sm">
            Check your email to confirm your account, then log in.
          </p>
        ) : null}
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="redirect" value={params.redirect ?? ""} />
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          {state?.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <SubmitButton />
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium text-foreground underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
