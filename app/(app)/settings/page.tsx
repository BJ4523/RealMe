import Link from "next/link";
import { UserRound, Link2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function SettingsPage() {
  const { profile } = await requireUser();

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile and studio." />

      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/settings/avatar"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:shadow"
        >
          <UserRound className="size-4" /> Avatar
        </Link>
        <Link
          href="/settings/connections"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:shadow"
        >
          <Link2 className="size-4" /> MLS connection
        </Link>
      </div>

      <Card className="rounded-3xl">
        <CardContent className="pt-6">
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>
    </>
  );
}
