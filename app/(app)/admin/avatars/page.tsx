import { Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { isMock } from "@/lib/heygen/client";
import { listCustomAvatars } from "@/lib/heygen/avatar";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { deleteAvatarGroupAction } from "@/app/(app)/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminAvatarsPage() {
  await requireAdmin();
  const photos = await listCustomAvatars();

  return (
    <>
      <PageHeader
        title="HeyGen avatars"
        description="Custom photo avatars on the HeyGen account. Delete unused ones to free quota slots."
      />

      <p className="mb-6 rounded-2xl border border-border bg-muted/50 p-4 text-xs text-muted-foreground">
        These are the account&apos;s custom photo-avatar groups (HeyGen&apos;s
        own list — no stock avatars). The plan&apos;s photo-avatar cap is{" "}
        <strong>account-wide</strong>, shared across all users, so clean up
        unused ones to free slots. Deleting a group frees a quota slot; deletion
        is permanent.
      </p>

      {isMock ? (
        <p className="text-sm text-muted-foreground">
          HeyGen is in mock mode — no live avatars to show.
        </p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No custom photo avatars on the account — all quota slots are free.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3"
            >
              <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.previewUrl}
                    alt="Avatar preview"
                    className="size-full object-cover"
                  />
                ) : null}
              </div>
              <code className="truncate text-[10px] text-muted-foreground">
                {p.id}
              </code>
              <form action={deleteAvatarGroupAction}>
                <input type="hidden" name="id" value={p.id} />
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  className="w-full rounded-full"
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </form>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
