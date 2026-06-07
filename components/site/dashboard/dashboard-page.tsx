// @ts-nocheck
/* eslint-disable */
"use client";
import { useRouter } from "next/navigation";
import { DashboardShell } from "./shell";

export function DashboardPageClient() {
  const router = useRouter();
  return (
    <div className="realme-surface">
      <DashboardShell
        onBackToSite={() => router.push("/")}
        onOpenLive={() => router.push("/live")}
      />
    </div>
  );
}
