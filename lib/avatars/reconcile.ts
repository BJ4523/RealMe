import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { getDigitalTwinInfo } from "@/lib/heygen/avatar";
import { isMock } from "@/lib/heygen/client";

type Db = SupabaseClient<Database>;

/** The avatar fields needed to reconcile training status + voice. */
export interface ReconcilableAvatar {
  id: string;
  status: Database["public"]["Enums"]["avatar_status"];
  heygen_avatar_id: string | null;
  error: string | null;
  voice_id: string | null;
}

/**
 * Digital-twin training is async and HeyGen sends NO webhook when it finishes or
 * fails — so a twin that fails training (e.g. "Footage is too short or too
 * long") otherwise stays `processing` in our DB forever, and the UI keeps
 * letting the user generate videos against an avatar that will never work.
 *
 * This asks HeyGen for the look's real status and, if it has resolved, patches
 * the row to `ready`/`failed` (recording the failure reason). It also backfills
 * `voice_id` from the twin's own cloned voice (`default_voice_id`) when ours is
 * missing — HeyGen's `/v2/voices/clone` is unreliable on video input, so without
 * this the video falls back to a stock voice instead of the agent's. Best-effort:
 * a still-processing twin with a voice already set, or any lookup error, leaves
 * the row untouched. Returns the (possibly updated) avatar.
 */
export async function reconcileAvatar<T extends ReconcilableAvatar>(
  supabase: Db,
  avatar: T,
): Promise<T> {
  if (isMock) return avatar;
  if (!avatar.heygen_avatar_id) return avatar;

  const needStatus = avatar.status === "processing";
  const needVoice = !avatar.voice_id;
  if (!needStatus && !needVoice) return avatar;

  const info = await getDigitalTwinInfo(avatar.heygen_avatar_id);

  const patch: Partial<ReconcilableAvatar> = {};
  if (needStatus && info.status !== "processing") {
    patch.status = info.status;
    patch.error = info.status === "failed" ? info.error : null;
  }
  if (needVoice && info.defaultVoiceId) {
    patch.voice_id = info.defaultVoiceId;
  }
  if (Object.keys(patch).length === 0) return avatar;

  await supabase.from("avatars").update(patch).eq("id", avatar.id);
  return { ...avatar, ...patch };
}
