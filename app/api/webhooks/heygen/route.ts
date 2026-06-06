import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

/**
 * HeyGen video completion callback. Verified by a shared secret passed as a
 * query param (?secret=) we set when submitting the job. Uses the service-role
 * client because there is no user session on a webhook.
 */
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (env.heygenWebhookSecret && secret !== env.heygenWebhookSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  // HeyGen shapes vary across versions — extract generously.
  const data = (payload.event_data ?? payload) as Record<string, unknown>;
  const eventType = String(payload.event_type ?? payload.event ?? "");
  const videoId = String(data.video_id ?? data.videoId ?? "");
  const videoUrl = (data.url ?? data.video_url) as string | undefined;
  const failed = eventType.includes("fail") || data.status === "failed";

  if (!videoId) {
    return NextResponse.json({ error: "missing video_id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const update = failed
    ? {
        status: "failed" as const,
        error: String(data.msg ?? data.error ?? "Generation failed."),
      }
    : {
        status: "completed" as const,
        video_url: videoUrl ?? null,
        duration:
          typeof data.duration === "number" ? (data.duration as number) : null,
      };

  await supabase
    .from("videos")
    .update(update)
    .eq("heygen_video_id", videoId);

  return NextResponse.json({ received: true });
}
