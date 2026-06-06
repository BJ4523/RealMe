import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, requireEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Service-role client. Bypasses RLS — use ONLY in trusted server contexts
 * with no user session (webhooks, cron). Never import into client code.
 */
export function createAdminClient() {
  return createClient<Database>(
    requireEnv("supabaseUrl"),
    requireEnv("supabaseServiceRoleKey"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

export const adminConfigured =
  env.supabaseUrl.length > 0 && env.supabaseServiceRoleKey.length > 0;
