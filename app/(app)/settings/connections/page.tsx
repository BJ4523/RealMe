import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveMlsConnection, syncListings } from "@/app/(app)/settings/actions";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    blurb:
      "Bring your MLS credentials; we normalize the RESO/RETS feed and import your listings. Try it now with the demo account (simplyrets / simplyrets, agent sphelps).",
    available: true,
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
  const { userId, profile } = await requireUser();
  const supabase = await createClient();
  const { data: connection } = await supabase
    .from("mls_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const current = connection?.provider ?? "manual";
  const creds = (connection?.credentials ?? {}) as {
    username?: string;
    password?: string;
  };

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
              className="rounded-3xl border border-border bg-card p-6"
            >
              <div className="flex items-start justify-between gap-4">
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
                {p.available && !active && p.id !== "simplyrets" ? (
                  <form action={saveMlsConnection}>
                    <input type="hidden" name="provider" value={p.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      className="rounded-full"
                    >
                      Use this
                    </Button>
                  </form>
                ) : null}
              </div>

              {p.id === "simplyrets" ? (
                <div className="mt-5 border-t border-border pt-5">
                  <form
                    action={saveMlsConnection}
                    className="grid gap-3 sm:grid-cols-3"
                  >
                    <input type="hidden" name="provider" value="simplyrets" />
                    <div className="grid gap-1.5">
                      <Label htmlFor="sr-user">Username</Label>
                      <Input
                        id="sr-user"
                        name="username"
                        defaultValue={creds.username || "simplyrets"}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="sr-pass">Password</Label>
                      <Input
                        id="sr-pass"
                        name="password"
                        type="password"
                        defaultValue={creds.password || "simplyrets"}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="sr-agent">Agent MLS id</Label>
                      <Input
                        id="sr-agent"
                        name="agentMlsId"
                        defaultValue={profile?.mls_agent_id || "sphelps"}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Button
                        type="submit"
                        variant="outline"
                        className="rounded-full"
                      >
                        {active ? "Update connection" : "Connect"}
                      </Button>
                    </div>
                  </form>

                  {active ? (
                    <form action={syncListings} className="mt-3">
                      <Button
                        type="submit"
                        className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
                      >
                        Sync listings now
                      </Button>
                      {connection?.last_synced_at ? (
                        <span className="ml-3 text-xs text-muted-foreground">
                          Last synced{" "}
                          {new Date(connection.last_synced_at).toLocaleString()}
                        </span>
                      ) : null}
                    </form>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
