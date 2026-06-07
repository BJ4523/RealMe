import { requireUser } from "@/lib/auth";
import { DashboardPageClient } from "@/components/site/dashboard/dashboard-page";

export const metadata = { title: "RealMe — Studio" };

export default async function AppDashboardPage() {
  // Auth gate: redirects to /login if not signed in.
  await requireUser();
  return <DashboardPageClient />;
}
