"use client";

import { useActionState, use } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, KeyRound } from "lucide-react";
import { sendMagicLink, verifyEmailOtp, type AuthState } from "../actions";
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

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = use(searchParams);
  const next = params.next ?? "/app";
  const [sendState, sendAction] = useActionState<AuthState, FormData>(
    sendMagicLink,
    undefined,
  );
  const [verifyState, verifyAction] = useActionState<AuthState, FormData>(
    verifyEmailOtp,
    undefined,
  );

  // After the email is sent: confirm the link AND offer code entry (any browser).
  if (sendState?.sent) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="flex flex-col gap-5 pt-8 pb-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/30">
              <CheckCircle2 className="size-6" />
            </div>
            <h1 className="font-heading text-2xl font-bold">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              We sent a magic link and a 6-digit code to{" "}
              <span className="font-medium text-foreground">{sendState.email}</span>.
              Tap the link on this device — or enter the code below (works from any
              browser).
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono uppercase tracking-widest">Or enter code</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form action={verifyAction} className="flex flex-col gap-3">
            <input type="hidden" name="email" value={sendState.email ?? ""} />
            <input type="hidden" name="next" value={next} />
            <div className="grid gap-2">
              <Label htmlFor="token" className="sr-only">6-digit code</Label>
              <Input
                id="token"
                name="token"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                placeholder="123456"
                className="text-center font-mono text-2xl tracking-[0.4em]"
              />
            </div>
            {verifyState?.error ? (
              <p className="text-sm text-destructive">{verifyState.error}</p>
            ) : null}
            <SubmitButton label="Verify code & sign in" pendingLabel="Verifying…" />
          </form>

          <form action={sendAction}>
            <input type="hidden" name="email" value={sendState.email ?? ""} />
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="w-full text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Resend email
            </button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">Sign in to RealMe</CardTitle>
        <CardDescription>
          No password — we&apos;ll email you a magic link and a one-time code.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={sendAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
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
          {sendState?.error ? (
            <p className="text-sm text-destructive">{sendState.error}</p>
          ) : null}
          <SubmitButton label="Email me a link & code" pendingLabel="Sending…" />
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="size-3" />
            Different browser? Use the code we email you.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
