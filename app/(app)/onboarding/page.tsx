import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AvatarUploader } from "@/components/avatar/avatar-uploader";
import { Card, CardContent } from "@/components/ui/card";

export default async function OnboardingPage() {
  const { profile } = await requireUser();
  if (profile?.onboarding_completed) redirect("/app");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center text-center">
      <span className="rounded-full bg-accent px-3 py-1 font-mono text-xs uppercase tracking-widest text-accent-foreground">
        Step 1 of 1
      </span>
      <h1 className="mt-5 font-heading text-3xl font-extrabold tracking-tight">
        Create your avatar
      </h1>
      <p className="mt-2 text-muted-foreground">
        Upload one clear photo of your face — and, if you like, a short voice
        clip. We&apos;ll turn them into a talking avatar that narrates your
        listing videos in your own voice.
      </p>
      <Card className="mt-8 w-full rounded-3xl text-left">
        <CardContent className="pt-6">
          <AvatarUploader redirectTo="/app" />
        </CardContent>
      </Card>
    </div>
  );
}
