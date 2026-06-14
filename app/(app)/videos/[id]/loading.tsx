import { PageHeaderSkeleton, SkeletonBar } from "@/components/shared/skeletons";

/** Mirrors the video detail page: back link + header + a tall 9:16 player and
 *  the generation controls below. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading video">
      <SkeletonBar className="mb-6 h-4 w-24" />
      <PageHeaderSkeleton />
      <div className="mx-auto w-full max-w-sm">
        <SkeletonBar className="aspect-[9/16] w-full rounded-3xl" />
      </div>
      <div className="mt-6 space-y-3">
        <SkeletonBar className="h-40 rounded-2xl" />
        <div className="flex flex-wrap gap-3">
          <SkeletonBar className="h-10 w-40 rounded-2xl" />
          <SkeletonBar className="h-10 w-24 rounded-full" />
          <SkeletonBar className="h-10 w-28 rounded-full" />
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <SkeletonBar className="h-12 w-48 rounded-full" />
          <SkeletonBar className="h-12 w-36 rounded-full" />
        </div>
      </div>
    </div>
  );
}
