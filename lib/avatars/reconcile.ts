import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { getDigitalTwinInfo } from "@/lib/heygen/avatar";
import { isMock } from "@/lib/heygen/client";

type Db = SupabaseClient<Database>;

/** The avatar fields needed to reconcile training status. */
export interface ReconcilableAvatar {
  id: string;
  status: Database["public"]["Enums"]["avatar_status"];
  heygen_avatar_id: string | null;
  error: string | null;
}

/**
 * Digital-twin training is async and HeyGen sends NO webhook when it finishes or
 * fails — so a twin that fails training (e.g. "Footage is too short or too
 * long") otherwise stays `processing` in our DB forever, and the UI keeps
 * letting the user generate videos against an avatar that will never work.
 *
 * This asks HeyGen for the look's real status and, if it has resolved, patches
 * the row to `ready`/`failed` (recording the failure reason). Best-effort: a
 * still-processing twin or any lookup error leaves the row untouched. Returns
 * the (possibly updated) avatar so callers can render the fresh state.
 */
export async function reconcileAvatar<T extends ReconcilableAvatar>(
  supabase: Db,
  avatar: T,
): Promise<T> {
  if (isMock) return avatar;
  if (avatar.status !== "processing") return avatar;
  if (!avatar.heygen_avatar_id) return avatar;

  const info = await getDigitalTwinInfo(avatar.heygen_avatar_id);
  if (info.status === "processing") return avatar;

  const patch = {
    status: info.status,
    error: info.status === "failed" ? info.error : null,
  };
  await supabase.from("avatars").update(patch).eq("id", avatar.id);
  return { ...avatar, ...patch };
}
