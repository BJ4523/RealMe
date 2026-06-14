import { PageHeaderSkeleton, SkeletonBar } from "@/components/shared/skeletons";

/**
 * Generic loading boundary for content/form pages in the functional app group
 * (settings, avatar, onboarding, admin) — a header plus a couple of content
 * blocks. List and detail routes override this with their own loading.tsx.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton />
      <div className="space-y-4">
        <SkeletonBar className="h-40 rounded-3xl" />
        <SkeletonBar className="h-24 rounded-3xl" />
      </div>
    </div>
  );
}
