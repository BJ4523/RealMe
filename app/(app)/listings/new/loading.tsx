import { PageHeaderSkeleton, SkeletonBar } from "@/components/shared/skeletons";

/** Mirrors the new-listing flow: header + URL/Manual tabs + a form block. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton />
      <SkeletonBar className="mb-6 h-10 w-64 rounded-full" />
      <div className="space-y-3">
        <SkeletonBar className="h-12 rounded-2xl" />
        <SkeletonBar className="h-12 w-40 rounded-full" />
      </div>
    </div>
  );
}
