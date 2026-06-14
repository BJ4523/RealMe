import Image from "next/image";
import Link from "next/link";
import { Play, ImageOff } from "lucide-react";
import type { Tables } from "@/lib/types/database";
import { StatusBadge } from "./status-badge";
import { DeleteVideoButton } from "./delete-video-button";

export function VideoCard({ video }: { video: Tables<"videos"> }) {
  return (
    <Link
      href={`/videos/${video.id}`}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition-shadow hover:shadow-lg"
    >
      <DeleteVideoButton videoId={video.id} />
      <div className="relative aspect-[9/16] overflow-hidden bg-muted">
        {video.thumbnail_url ? (
          <Image
            src={video.thumbnail_url}
            alt={video.title ?? "Video"}
            fill
            sizes="(max-width: 640px) 50vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" />
          </div>
        )}
        {video.status === "completed" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Play className="size-5 fill-current" />
            </div>
          </div>
        ) : null}
        <div className="absolute left-3 top-3">
          <StatusBadge status={video.status} />
        </div>
      </div>
      <div className="flex flex-col gap-1 p-4">
        <p className="truncate font-medium">{video.title ?? "Untitled video"}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(video.created_at).toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}
