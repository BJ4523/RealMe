"use client";

import { useState } from "react";
import type { Tables } from "@/lib/types/database";
import { VideoCard } from "./video-card";

type Video = Tables<"videos">;
type Bucket = "all" | "ready" | "processing" | "failed";

/** Map a row's raw status into one of the user-facing filter buckets. */
function bucketOf(status: string): Exclude<Bucket, "all"> {
  if (status === "completed") return "ready";
  if (status === "failed") return "failed";
  return "processing"; // pending_script / script_ready / submitting / processing
}

/** Client filter over the server-fetched videos: status chips + filtered grid. */
export function VideosFilter({ videos }: { videos: Video[] }) {
  const [filter, setFilter] = useState<Bucket>("all");

  const counts = {
    all: videos.length,
    ready: videos.filter((v) => bucketOf(v.status) === "ready").length,
    processing: videos.filter((v) => bucketOf(v.status) === "processing").length,
    failed: videos.filter((v) => bucketOf(v.status) === "failed").length,
  };
  const chips: { id: Bucket; label: string }[] = [
    { id: "all", label: "All" },
    { id: "ready", label: "Ready" },
    { id: "processing", label: "Processing" },
    { id: "failed", label: "Failed" },
  ];
  const shown =
    filter === "all" ? videos : videos.filter((v) => bucketOf(v.status) === filter);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === c.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {c.label}
            <span className="ml-1.5 font-mono text-xs opacity-60">
              {counts[c.id]}
            </span>
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No {filter} videos.
        </p>
      )}
    </div>
  );
}
