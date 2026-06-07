import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mapDbListingToDesign } from "@/lib/site/map-listing";
import { DashboardPageClient } from "@/components/site/dashboard/dashboard-page";

export const metadata = { title: "RealMe — Studio" };

export default async function AppDashboardPage() {
  // Auth gate: redirects to /login if not signed in.
  await requireUser();

  const supabase = await createClient();
  const [{ data: rows }, { data: avatar }] = await Promise.all([
    supabase.from("listings").select("*").order("created_at", { ascending: false }),
    supabase
      .from("avatars")
      .select("id")
      .eq("is_active", true)
      .eq("status", "ready")
      .maybeSingle(),
  ]);

  const listings = (rows ?? []).map((row, i) => mapDbListingToDesign(row, i));

  return <DashboardPageClient listings={listings} hasAvatar={!!avatar} />;
}
