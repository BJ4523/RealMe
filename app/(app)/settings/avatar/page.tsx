import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setActiveAvatar } from "@/app/(app)/onboarding/actions";
import { PageHeader } from "@/components/shared/page-header";
import { AvatarUploader } from "@/components/avatar/avatar-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/videos/status-badge";

export default async function AvatarSettingsPage() {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const { data: avatars } = await supabase
    .from("avatars")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (
    <>
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <PageHeader
        title="Your avatar"
        description="Create a new avatar or switch which one stars in your videos."
      />

      {avatars && avatars.length > 0 ? (
        <div className="mb-8 flex flex-col gap-3">
          {avatars.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4"
            >
              <div className="flex items-center gap-3">
                {a.is_active ? (
                  <CheckCircle2 className="size-5 text-foreground" />
                ) : (
                  <div className="size-5 rounded-full border border-border" />
                )}
                <div>
                  <p className="font-medium">{a.name ?? "Avatar"}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.is_active ? "Active" : "Inactive"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:block">
                  <StatusBadge
                    status={a.status === "ready" ? "completed" : "processing"}
                  />
                </span>
                {!a.is_active ? (
                  <form action={setActiveAvatar}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                    >
                      Make active
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Card className="rounded-3xl">
        <CardContent className="pt-6">
          <h2 className="mb-4 font-heading text-lg font-bold">New avatar</h2>
          <AvatarUploader redirectTo="/settings/avatar" />
        </CardContent>
      </Card>
    </>
  );
}
