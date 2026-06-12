/**
 * Route-group loading boundary: gives every functional page (videos, listings,
 * settings…) INSTANT visual feedback on navigation instead of a frozen click
 * while the server renders. Skeleton matches the rounded-card design language.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-full bg-muted" />
      <div className="h-44 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-36 animate-pulse rounded-3xl bg-muted" />
        <div className="h-36 animate-pulse rounded-3xl bg-muted" />
      </div>
    </div>
  );
}
