import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveMlsConnection } from "@/app/(app)/settings/actions";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PROVIDERS = [
  {
    id: "manual",
    name: "Manual + URL import",
    blurb: "Add listings by hand or paste a listing URL. No approval needed.",
    available: true,
  },
  {
    id: "simplyrets",
    name: "SimplyRETS",
    blurb: "Bring your MLS credentials; we normalize the RESO/RETS feed.",
    available: false,
  },
  {
    id: "reso",
    name: "RESO Web API",
    blurb: "Direct MLS access filtered to your ListAgentMlsId. Per-MLS approval.",
    available: false,
  },
  {
    id: "mlsgrid",
    name: "MLS Grid",
    blurb: "Aggregated RESO data across 100+ participating MLSs.",
    available: false,
  },
];

export default async function ConnectionsPage() {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const { data: connection } = await supabase
    .from("mls_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const current = connection?.provider ?? "manual";

  return (
    <>
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <PageHeader
        title="MLS connection"
        description="Choose how your listings get into Real Me. More providers are on the way."
      />

      <div className="flex flex-col gap-4">
        {PROVIDERS.map((p) => {
          const active = current === p.id;
          return (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-3xl border border-border bg-card p-6"
            >
              <div className="max-w-md">
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-lg font-bold">{p.name}</h3>
                  {active ? (
                    <Badge className="rounded-full bg-accent text-accent-foreground">
                      <Check className="size-3" /> Connected
                    </Badge>
                  ) : !p.available ? (
                    <Badge variant="secondary" className="rounded-full">
                      Coming soon
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
              </div>
              {p.available && !active ? (
                <form action={saveMlsConnection}>
                  <input type="hidden" name="provider" value={p.id} />
                  <Button type="submit" variant="outline" className="rounded-full">
                    Use this
                  </Button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
