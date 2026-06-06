import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/** Supabase client for Client Components (realtime subscriptions, optimistic UI). */
export function createClient() {
  return createBrowserClient<Database>(
    env.supabaseUrl,
    env.supabasePublishableKey,
  );
}
