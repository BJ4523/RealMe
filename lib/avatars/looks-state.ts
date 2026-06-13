/**
 * Shape of `avatars.looks` (jsonb): the per-outfit canonical look images that
 * drive video generation. Each look is a v3 prompt-avatar attached to the twin
 * group (no separate model-training step). Pure types + a tolerant parser
 * shared by the client UI and server actions.
 */
export interface LookItem {
  status: "generating" | "ready" | "failed";
  /** v3 look id — usable directly as a Seedance avatar_id. */
  lookId?: string;
  /** Canonical face-on image (drives the talking bookends) once ready. */
  imageUrl?: string;
  error?: string;
}

export interface LooksState {
  items: Record<string, LookItem>;
}

export function parseLooks(raw: unknown): LooksState {
  const o = (raw ?? {}) as Partial<LooksState>;
  return { items: o.items && typeof o.items === "object" ? o.items : {} };
}

/** Looks fully ready to drive a video (lookId + canonical image). */
export function readyLooks(
  state: LooksState,
): Array<{ outfitId: string; lookId: string; imageUrl: string }> {
  return Object.entries(state.items)
    .filter(
      (e): e is [string, LookItem] =>
        e[1].status === "ready" && !!e[1].lookId && !!e[1].imageUrl,
    )
    .map(([outfitId, l]) => ({ outfitId, lookId: l.lookId!, imageUrl: l.imageUrl! }));
}
