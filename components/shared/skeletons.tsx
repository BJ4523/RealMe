/**
 * Shared skeleton building blocks so route `loading.tsx` boundaries mirror the
 * real page layout (header + the right card shape/grid) instead of a generic
 * block. All use the same `animate-pulse rounded bg-muted` language as the cards.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

/** Matches PageHeader: big title + description, optional right-side action pill. */
export function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <Bar className="h-8 w-48 rounded-lg" />
        <Bar className="h-4 w-64" />
      </div>
      {action ? <Bar className="h-10 w-32 rounded-full" /> : null}
    </div>
  );
}

/**
 * A grid of card skeletons matching the real card: media area at `aspect` + a
 * text footer. `aspect` is a Tailwind aspect class (e.g. "aspect-[9/16]" for
 * videos, "aspect-video" for listings).
 */
export function CardGridSkeleton({
  count = 6,
  aspect,
  footerLines = 2,
}: {
  count?: number;
  aspect: string;
  footerLines?: number;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-3xl border border-border bg-card"
        >
          <div className={`${aspect} animate-pulse bg-muted`} />
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: footerLines }).map((_, j) => (
              <Bar
                key={j}
                className={`h-4 ${j === 0 ? "w-3/4" : "w-1/3"}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A row of pill chips (e.g. the video status filter). */
export function ChipRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Bar key={i} className="h-8 w-20 rounded-full" />
      ))}
    </div>
  );
}

export { Bar as SkeletonBar };
