/**
 * Shape of `avatars.looks` (jsonb): the twin's photo-model training state and
 * the per-outfit canonical look images. Pure types + a tolerant parser shared
 * by the client UI and server actions.
 */
export interface LookItem {
  status: "generating" | "ready" | "failed";
  generationId?: string;
  /** Usable as a Seedance avatar_id once ready. */
  lookId?: string;
  /** Canonical face-on image (drives the talking bookends). */
  imageUrl?: string;
  error?: string;
}

export interface LooksState {
  model: "untrained" | "training" | "ready" | "failed";
  items: Record<string, LookItem>;
}

export function parseLooks(raw: unknown): LooksState {
  const o = (raw ?? {}) as Partial<LooksState>;
  const model =
    o.model === "training" || o.model === "ready" || o.model === "failed"
      ? o.model
      : "untrained";
  return { model, items: o.items && typeof o.items === "object" ? o.items : {} };
}

/** Looks that are fully ready to drive a video (lookId + canonical image). */
export function readyLooks(
  state: LooksState,
): Array<{ outfitId: string; lookId: string; imageUrl: string }> {
  return Object.entries(state.items)
    .filter(
      (e): e is [string, Required<Pick<LookItem, "lookId" | "imageUrl">> & LookItem] =>
        e[1].status === "ready" && !!e[1].lookId && !!e[1].imageUrl,
    )
    .map(([outfitId, l]) => ({ outfitId, lookId: l.lookId!, imageUrl: l.imageUrl! }));
}
