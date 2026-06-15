// @ts-nocheck
/* eslint-disable */
"use client";
import { useRouter } from "next/navigation";
import { RealMeLive } from "./live";

export function LivePageClient({
  heroReelUrl = null,
  heroPoster = null,
}: {
  heroReelUrl?: string | null;
  heroPoster?: string | null;
}) {
  const router = useRouter();
  return (
    <div className="realme-surface">
      <RealMeLive
        onBackToSite={() => router.push("/")}
        heroReelUrl={heroReelUrl}
        heroPoster={heroPoster}
      />
    </div>
  );
}
