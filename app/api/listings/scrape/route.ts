import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getListingProvider } from "@/lib/listings";

/** Resolve a listing draft from a pasted URL. Requires an authenticated user. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  if (!body.url) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  try {
    const draft = await getListingProvider("url_scrape").fetchOne({
      url: body.url,
    });
    if (!draft) {
      return NextResponse.json(
        { error: "Could not read listing details from that URL." },
        { status: 422 },
      );
    }
    return NextResponse.json({ draft });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
