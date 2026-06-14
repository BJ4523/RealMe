import {
  PageHeaderSkeleton,
  CardGridSkeleton,
  SkeletonBar,
} from "@/components/shared/skeletons";

/** Mirrors the Listings list: header (+ Add action) + search + landscape card grid. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading listings">
      <PageHeaderSkeleton action />
      <SkeletonBar className="mb-5 h-9 w-full max-w-sm rounded-full" />
      <CardGridSkeleton aspect="aspect-video" footerLines={3} />
    </div>
  );
}
