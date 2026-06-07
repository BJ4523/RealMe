/**
 * Central env access. Intentionally does NOT throw at import time so the app
 * builds in mock-first mode without real keys. Server features that genuinely
 * need a key call `requireEnv()` at runtime and fail loudly there instead.
 */

export const env = {
  // Public (sent to the browser)
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",

  // Server-only
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  heygenApiKey: process.env.HEYGEN_API_KEY ?? "",
  heygenWebhookSecret: process.env.HEYGEN_WEBHOOK_SECRET ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",

  // Comma-separated allowlist of emails permitted to use the /admin routes.
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  // Flags
  heygenMock: (process.env.HEYGEN_MOCK ?? "1") !== "0",
} as const;

export function requireEnv<K extends keyof typeof env>(key: K): string {
  const value = env[key];
  if (!value || typeof value !== "string") {
    throw new Error(
      `Missing required environment variable for "${String(key)}". ` +
        `Set it in .env.local (see .env.example).`,
    );
  }
  return value;
}

/** True when Supabase is configured enough to talk to. */
export const isSupabaseConfigured =
  env.supabaseUrl.length > 0 && env.supabasePublishableKey.length > 0;
