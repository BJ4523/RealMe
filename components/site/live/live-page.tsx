// @ts-nocheck
/* eslint-disable */
"use client";
import { useRouter } from "next/navigation";
import { RealMeLive } from "./live";

export function LivePageClient() {
  const router = useRouter();
  return (
    <div className="realme-surface">
      <RealMeLive onBackToSite={() => router.push("/")} />
    </div>
  );
}
