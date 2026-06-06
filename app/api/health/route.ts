import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isMock } from "@/lib/heygen/client";

export async function GET() {
  return NextResponse.json({
    ok: true,
    supabase: isSupabaseConfigured,
    heygenMock: isMock,
  });
}
