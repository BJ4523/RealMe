/**
 * Loading boundary for the design dashboard — mirrors its shell (left sidebar +
 * main column with a top bar and content cards) so navigation feels instant and
 * the layout doesn't jump when the real page mounts.
 */
export default function Loading() {
  const bar = "animate-pulse rounded bg-black/10";
  return (
    <div
      aria-busy="true"
      aria-label="Loading dashboard"
      className="realme-surface flex min-h-screen"
    >
      {/* Sidebar (desktop only, like the real shell) */}
      <aside className="hidden w-60 shrink-0 flex-col gap-3 border-r border-black/10 p-5 md:flex">
        <div className={`${bar} h-6 w-28`} />
        <div className="mt-6 flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${bar} h-9 w-full rounded-lg`} />
          ))}
        </div>
        <div className={`${bar} mt-auto h-24 w-full rounded-xl`} />
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-black/10 p-4">
          <div className={`${bar} h-9 w-full max-w-xs rounded-full`} />
          <div className="flex gap-2">
            <div className={`${bar} h-9 w-9 rounded-full`} />
            <div className={`${bar} h-9 w-28 rounded-full`} />
          </div>
        </div>
        <div className="flex flex-col gap-4 p-6">
          <div className={`${bar} h-32 w-full rounded-2xl`} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`${bar} h-40 rounded-2xl`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
