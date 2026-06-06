import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Reads/writes the auth cookie via Next's async cookie store.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where setting cookies is not
            // allowed. Safe to ignore — the proxy refreshes the session.
          }
        },
      },
    },
  );
}
