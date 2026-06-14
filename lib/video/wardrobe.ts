/**
 * Agent wardrobe options for video generation. The chosen outfit is pinned into
 * EVERY room-clip prompt so the agent's clothing stays consistent across the
 * independently-generated Seedance scenes. Shared by the client selector
 * (labels) and the server prompt builder (prompt text) — no server-only deps.
 */
export interface WardrobeOption {
  id: string;
  label: string;
  gender: "men" | "women";
  /** Wardrobe clause injected into the room-clip prompt. */
  prompt: string;
}

export const WARDROBES: WardrobeOption[] = [
  // Men's
  {
    id: "m-blazer",
    label: "Charcoal blazer + white shirt",
    gender: "men",
    prompt:
      "wearing a tailored charcoal blazer over a crisp white dress shirt, dark trousers and dark brown leather dress shoes",
  },
  {
    id: "m-navy-suit",
    label: "Navy suit (no tie)",
    gender: "men",
    prompt:
      "wearing a well-fitted navy suit with a light blue dress shirt, open collar, no tie, and dark brown leather dress shoes",
  },
  {
    id: "m-quarter-zip",
    label: "Smart-casual quarter-zip",
    gender: "men",
    prompt:
      "wearing a smart-casual quarter-zip sweater over a collared shirt, tailored chinos and clean white leather sneakers",
  },
  {
    id: "m-button-down",
    label: "White button-down + slacks",
    gender: "men",
    prompt:
      "wearing a crisp white button-down shirt with sleeves rolled, dark dress slacks and brown leather loafers",
  },
  // Women's
  {
    id: "w-blazer",
    label: "Blazer + silk blouse",
    gender: "women",
    prompt:
      "wearing a tailored blazer over a silk blouse, slim dress trousers and pointed-toe heels",
  },
  {
    id: "w-sheath",
    label: "Sheath dress",
    gender: "women",
    prompt: "wearing an elegant, professional knee-length sheath dress with classic closed-toe heels",
  },
  {
    id: "w-sweater",
    label: "Smart-casual sweater",
    gender: "women",
    prompt:
      "wearing a smart-casual fitted sweater, tailored high-waisted pants and ankle boots",
  },
  {
    id: "w-pencil-skirt",
    label: "Blazer + pencil skirt",
    gender: "women",
    prompt: "wearing a professional blazer with a matching pencil skirt, blouse and classic pumps",
  },
];

/** Resolve an outfit id to its prompt clause (falls back to the first option). */
export function wardrobePrompt(id: string | null | undefined): string {
  return WARDROBES.find((w) => w.id === id)?.prompt ?? WARDROBES[0].prompt;
}
