import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Db = SupabaseClient<Database>;
type AssembleStatus = "processing" | "completed" | "failed";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Background self-driver for the cinematic / hype-reel pipelines.
 *
 * Those assemblers are a one-step state machine: each call advances a single
 * stage (poll the HeyGen clips → fire + poll the lip-syncs → stitch + narrate)
 * and returns `"processing"` while HeyGen is still rendering. On their own they
 * make NO progress — something has to keep re-invoking them. Historically that
 * was only the video page's poll (so the tab had to stay open) or the every-2-min
 * reconcile cron (so a missed/slow cron meant a job sat for hours). That's the
 * "needs client-side intervention" problem.
 *
 * `selfDriveAssembly` is meant to be scheduled with `after()` right after a job
 * is submitted: it re-invokes the assembler on an interval until the job
 * finishes or the time budget runs out, so a reel completes in the background
 * with no open tab and no dependency on the cron's cadence. It is best-effort —
 * if the function is killed (cold budget, deploy) the reconcile cron and the
 * page poll remain as backstops, so this can only ever *help*, never block.
 */
export async function selfDriveAssembly(
  supabase: Db,
  videoId: string,
  runOnce: () => Promise<AssembleStatus>,
  { budgetMs = 230_000, intervalMs = 12_000 }: { budgetMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + budgetMs;
  try {
    while (Date.now() < deadline) {
      // Stop early if another driver (page poll / cron) already finished it, so
      // we don't redundantly re-stitch a completed reel.
      const { data } = await supabase
        .from("videos")
        .select("status")
        .eq("id", videoId)
        .maybeSingle();
      if (!data || data.status === "completed" || data.status === "failed") return;

      const result = await runOnce();
      if (result !== "processing") return;

      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      await sleep(Math.min(intervalMs, remaining));
    }
  } catch {
    // Best-effort — the reconcile cron and the video-page poll finish anything
    // this background run leaves unfinished.
  }
}
