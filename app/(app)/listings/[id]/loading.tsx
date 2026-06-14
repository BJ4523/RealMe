import { PageHeaderSkeleton, SkeletonBar } from "@/components/shared/skeletons";

/** Mirrors the listing detail: back link + header + hero photo + specs/actions. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading listing">
      <SkeletonBar className="mb-6 h-4 w-24" />
      <PageHeaderSkeleton action />
      <SkeletonBar className="aspect-video w-full rounded-3xl" />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <SkeletonBar className="h-20 rounded-2xl" />
        <SkeletonBar className="h-20 rounded-2xl" />
        <SkeletonBar className="h-20 rounded-2xl" />
      </div>
    </div>
  );
}
