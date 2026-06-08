"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

const emailSchema = z.object({
  email: z.email({ error: "Enter a valid email." }),
});

export type AuthState = { error?: string; sent?: boolean; email?: string } | undefined;

/**
 * Passwordless sign-in. Sends a magic link that returns the user to
 * /auth/callback (PKCE code exchange) and on to the app.
 */
export async function sendMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email." };
  }

  const next = (formData.get("next") as string) || "/app";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { error: error.message };
  return { sent: true, email: parsed.data.email };
}

/**
 * Verify the 6-digit email code from the magic-link email. Works in ANY browser
 * (no PKCE code verifier needed) — the fix for people who open the email on a
 * different device/browser than where they requested it.
 */
export async function verifyEmailOtp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = ((formData.get("email") as string) || "").trim();
  const token = ((formData.get("token") as string) || "").replace(/\s/g, "");
  const next = (formData.get("next") as string) || "/app";

  if (!email) return { error: "Missing email — request a new code.", sent: true };
  if (!/^\d{6}$/.test(token)) {
    return { error: "Enter the 6-digit code from your email.", sent: true, email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    return { error: "That code is invalid or expired. Try again.", sent: true, email };
  }
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
