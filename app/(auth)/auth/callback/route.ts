import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges an OAuth / PKCE code for a session, then redirects.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // The exchange failed (stale/reused link, or a PKCE verifier from another
  // browser) — but the user may ALREADY have a valid session, e.g. clicking an
  // old magic link while signed in. Don't bounce them to an error; let them in.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/login?error=callback", origin));
}
