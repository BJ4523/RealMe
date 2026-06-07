// @ts-nocheck
/* eslint-disable */
"use client";
import { useRouter } from "next/navigation";
import { DashboardShell } from "./shell";
import { DashboardDataProvider } from "./data-context";

export function DashboardPageClient({ listings }) {
  const router = useRouter();
  return (
    <div className="realme-surface">
      <DashboardDataProvider listings={listings}>
        <DashboardShell
          onBackToSite={() => router.push("/")}
          onOpenLive={() => router.push("/live")}
        />
      </DashboardDataProvider>
    </div>
  );
}
