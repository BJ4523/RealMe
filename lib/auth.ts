import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/types/database";

/**
 * Returns the authenticated user + profile, or redirects to /login.
 * Use in Server Components / Server Actions inside the (app) group.
 */
export async function requireUser(): Promise<{
  userId: string;
  email: string | null;
  profile: Tables<"profiles"> | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { userId: user.id, email: user.email ?? null, profile };
}

/**
 * Like requireUser, but also redirects to /onboarding until the agent has
 * completed avatar setup. Use on the core app pages (not on /onboarding).
 */
export async function requireOnboarded() {
  const ctx = await requireUser();
  if (!ctx.profile?.onboarding_completed) redirect("/onboarding");
  return ctx;
}
