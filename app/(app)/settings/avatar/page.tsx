import Link from "next/link";
import { ArrowLeft, CheckCircle2, Trash2, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reconcileAvatar } from "@/lib/avatars/reconcile";
import { deleteAvatar } from "@/app/(app)/onboarding/actions";
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

  // Each agent has a single avatar (creating a new one replaces the old). Show
  // the active one if present, otherwise the most recent — that's the twin the
  // user expects to "see" here.
  let current = avatars?.find((a) => a.is_active) ?? avatars?.[0] ?? null;

  // HeyGen doesn't webhook on twin training, so a twin that failed (e.g. footage
  // too short/long) would otherwise sit on "processing" forever. Reconcile the
  // real status now so the failure — and its reason — shows up here.
  if (current) current = await reconcileAvatar(supabase, current);

  const failed = current?.status === "failed";

  // The twin's source clip lives in the private `avatar-sources` bucket, so mint
  // a short-lived signed URL to actually play it back in the browser.
  let videoUrl: string | null = null;
  if (current?.source_path) {
    const { data: signed } = await supabase.storage
      .from("avatar-sources")
      .createSignedUrl(current.source_path, 3600);
    videoUrl = signed?.signedUrl ?? null;
  }

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
        description={
          current
            ? "This is the digital twin that stars in your videos. Preview it below, or replace it with a new clip."
            : "Record or upload one short clip of yourself — we build a digital twin that looks and sounds like you."
        }
      />

      {current ? (
        <Card className="mb-8 rounded-3xl">
          <CardContent className="flex flex-col gap-5 pt-6 sm:flex-row sm:items-start">
            <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-3xl bg-black sm:mx-0">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  playsInline
                  className="aspect-[3/4] size-full object-contain"
                />
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center text-xs text-muted-foreground">
                  Preview unavailable
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-3">
              <div className="flex items-center gap-2">
                {failed ? (
                  <AlertTriangle className="size-5 text-destructive" />
                ) : (
                  <CheckCircle2 className="size-5 text-foreground" />
                )}
                <p className="font-medium">{current.name ?? "Your avatar"}</p>
              </div>
              <StatusBadge
                status={
                  current.status === "ready"
                    ? "completed"
                    : current.status === "failed"
                      ? "failed"
                      : "processing"
                }
              />
              {failed ? (
                <p className="text-sm text-destructive">
                  Training failed{current.error ? `: ${current.error}` : "."}{" "}
                  Record a single continuous clip of 15–60s and replace it below.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {current.status === "ready"
                    ? "Your twin is trained and ready to narrate listings."
                    : "Your twin is still training — this can take a few minutes."}
                </p>
              )}
              <form action={deleteAvatar} className="mt-auto">
                <input type="hidden" name="id" value={current.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="rounded-full px-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" /> Delete avatar
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-3xl">
        <CardContent className="pt-6">
          <h2 className="mb-1 font-heading text-lg font-bold">
            {current ? "Replace your avatar" : "Create your avatar"}
          </h2>
          {current ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Uploading a new clip replaces your current twin.
            </p>
          ) : null}
          <div className={current ? "" : "mt-3"}>
            <AvatarUploader redirectTo="/settings/avatar" />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
