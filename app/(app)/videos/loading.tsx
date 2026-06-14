import {
  PageHeaderSkeleton,
  ChipRowSkeleton,
  CardGridSkeleton,
} from "@/components/shared/skeletons";

/** Mirrors the Videos list: header + status filter chips + 9:16 card grid. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading videos">
      <PageHeaderSkeleton />
      <ChipRowSkeleton count={4} />
      <CardGridSkeleton aspect="aspect-[9/16]" footerLines={2} />
    </div>
  );
}
