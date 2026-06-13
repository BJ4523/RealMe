import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";
import { env } from "@/lib/env";
import type { Tables } from "@/lib/types/database";

const ScriptSchema = z.object({
  narration: z
    .string()
    .describe("The full spoken walkthrough script, 60-90 seconds when read aloud."),
  segments: z
    .array(
      z.object({
        photoOrder: z
          .number()
          .describe("Index of the listing photo this line should show over."),
        line: z.string().describe("The narration line for this photo."),
      }),
    )
    .describe("Narration broken into lines, each mapped to a listing photo."),
});

export type WalkthroughScript = z.infer<typeof ScriptSchema>;

type Listing = Tables<"listings">;

/**
 * Generate a warm, on-camera walkthrough narration from listing details.
 * Uses Claude when ANTHROPIC_API_KEY is set; otherwise a deterministic
 * templated fallback so the full flow runs without a key.
 */
export async function generateWalkthroughScript(
  listing: Listing,
): Promise<WalkthroughScript> {
  if (!env.anthropicApiKey) {
    return templatedScript(listing);
  }

  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const photoCount = Array.isArray(listing.photos) ? listing.photos.length : 0;

  try {
    const message = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      system:
        "You are a real estate agent narrating a short walkthrough video of your own listing, on camera. " +
        "Write a warm, confident, concise script (about 60-90 seconds spoken). " +
        "Use ONLY the facts provided — never invent rooms, finishes, or numbers. " +
        "Open with a hook, walk the viewer through highlights, and close with a clear call to action to reach out. " +
        `Map narration lines to the ${photoCount} available photos by index (0-based).`,
      messages: [
        {
          role: "user",
          content: JSON.stringify(listingForPrompt(listing)),
        },
      ],
      output_config: { format: zodOutputFormat(ScriptSchema) },
    });

    return message.parsed_output ?? templatedScript(listing);
  } catch {
    // Fall back rather than blocking the user on an API hiccup.
    return templatedScript(listing);
  }
}

function listingForPrompt(listing: Listing) {
  return {
    address: listing.address,
    city: listing.city,
    state: listing.state,
    price: listing.price,
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    yearBuilt: listing.year_built,
    propertyType: listing.property_type,
    description: listing.description,
    features: listing.features,
    photoCount: Array.isArray(listing.photos) ? listing.photos.length : 0,
  };
}

function templatedScript(listing: Listing): WalkthroughScript {
  const place = [listing.address, listing.city].filter(Boolean).join(", ");
  const price = listing.price
    ? `$${Math.round(Number(listing.price)).toLocaleString("en-US")}`
    : null;
  const specs = [
    listing.beds ? `${listing.beds} bed` : null,
    listing.baths ? `${listing.baths} bath` : null,
    listing.sqft ? `${listing.sqft.toLocaleString("en-US")} square feet` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const lines: string[] = [];
  lines.push(`Hi, I'm so excited to show you ${place || "this listing"}.`);
  if (specs) lines.push(`This home offers ${specs}.`);
  if (price) lines.push(`It's listed at ${price}.`);
  if (listing.description) {
    lines.push(
      listing.description.length > 240
        ? listing.description.slice(0, 240).trim() + "..."
        : listing.description,
    );
  }
  const features = (listing.features ?? []).slice(0, 4);
  if (features.length) {
    lines.push(`A few highlights: ${features.join(", ")}.`);
  }
  lines.push(
    "If this feels like home, reach out and let's schedule a private tour.",
  );

  const photoCount = Array.isArray(listing.photos) ? listing.photos.length : 0;
  const segments = lines.map((line, i) => ({
    photoOrder: photoCount > 0 ? i % photoCount : 0,
    line,
  }));

  return { narration: lines.join(" "), segments };
}

const OpeningPitchSchema = z.object({
  pitch: z
    .string()
    .describe(
      "The agent's on-camera opening pitch, delivered standing in front of the " +
        "house — about 20 seconds spoken (45-60 words). Conversational and " +
        "confident: greet, name the property and headline stats, tease 2-3 real " +
        "highlights, and end with a clear call to action. Use ONLY provided facts.",
    ),
});

export type OpeningPitch = z.infer<typeof OpeningPitchSchema>;

/**
 * Target spoken length of the opening pitch. The opening is a fixed ~20s talking
 * shot, and an Avatar render runs exactly as long as its script — so the script
 * length IS the clip duration. We calibrate to ~150 wpm natural delivery
 * (≈2.5 words/sec) and cap hard so the opening can never overshoot the duration.
 */
const OPENING_PITCH_SECONDS = 20;
const WORDS_PER_SECOND = 2.5;
const TARGET_WORDS = Math.round(OPENING_PITCH_SECONDS * WORDS_PER_SECOND); // ~50
const MAX_WORDS = Math.round(TARGET_WORDS * 1.15); // ~57 hard ceiling

/** Trim to a whole-sentence boundary at/under the word ceiling (never mid-thought). */
function clampToBudget(text: string, maxWords = MAX_WORDS): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let out = "";
  for (const s of sentences) {
    const next = (out + " " + s).trim();
    if (next.split(/\s+/).length > maxWords) break;
    out = next;
  }
  return (out || words.slice(0, maxWords).join(" ")).trim();
}

/**
 * Generate the agent's ~20s on-camera OPENING PITCH (spoken lip-synced standing
 * in front of the house), LENGTH-CALIBRATED to the opening duration. This is the
 * editable script the user controls — it pre-fills the box. Uses Claude when
 * keyed; templated fallback else. Always clamped to the word budget so it can't
 * run past ~20s.
 */
export async function generateOpeningPitch(listing: Listing): Promise<string> {
  if (!env.anthropicApiKey) return clampToBudget(templatedOpeningPitch(listing));
  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const message = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 600,
      system:
        "You are a real-estate agent recording the OPENING of a listing reel, " +
        "on camera, standing in front of the house. Write ONLY what you SAY out " +
        `loud — calibrated to EXACTLY ${OPENING_PITCH_SECONDS} seconds of natural ` +
        `spoken delivery, which is about ${TARGET_WORDS} words and MUST NOT exceed ` +
        `${MAX_WORDS} words (the spoken length IS the video length, so do not run ` +
        "over). Include: a natural greeting, the property and its headline numbers " +
        "(beds/baths/sqft/price), a tease of 2-3 real highlights, and a punchy " +
        "call to action (e.g. 'DM me to see it this weekend'). Conversational, " +
        "confident, first person. Use ONLY the facts provided — never invent " +
        "rooms, finishes, or numbers. Count your words and stay within budget.",
      messages: [{ role: "user", content: JSON.stringify(listingForPrompt(listing)) }],
      output_config: { format: zodOutputFormat(OpeningPitchSchema) },
    });
    const pitch = message.parsed_output?.pitch?.trim();
    return pitch ? clampToBudget(pitch) : clampToBudget(templatedOpeningPitch(listing));
  } catch {
    return clampToBudget(templatedOpeningPitch(listing));
  }
}

function templatedOpeningPitch(listing: Listing): string {
  const place = [listing.address, listing.city].filter(Boolean).join(", ");
  const price = listing.price
    ? `$${Math.round(Number(listing.price)).toLocaleString("en-US")}`
    : null;
  const specs = [
    listing.beds ? `${listing.beds} beds` : null,
    listing.baths ? `${listing.baths} baths` : null,
    listing.sqft ? `${listing.sqft.toLocaleString("en-US")} square feet` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return [
    `Let me show you ${place || "this home"}.`,
    specs ? `${specs}.` : "",
    (listing.features ?? []).slice(0, 2).join(", ") +
      ((listing.features ?? []).length ? "." : ""),
    price ? `Asking ${price}.` : "",
    "DM me to come see it this weekend.",
  ]
    .filter(Boolean)
    .join(" ");
}

const HypeReelSchema = z.object({
  intro: z
    .string()
    .describe("Punchy ~5s on-camera host opener. One or two sentences."),
  outro: z.string().describe("~4s closing call-to-action, on camera."),
  featureCallouts: z
    .array(z.string())
    .describe(
      "2-3 SHORT on-screen text callouts (e.g. 'Chef's kitchen'). Max ~24 chars each.",
    ),
});

export type HypeReelScript = z.infer<typeof HypeReelSchema>;

/**
 * Generate a fast, high-energy hype-reel script: an on-camera host intro + outro
 * (lip-synced by the twin) plus short on-screen callouts. Uses Claude when keyed;
 * otherwise a deterministic templated fallback so the flow runs without a key.
 */
export async function generateHypeReelScript(
  listing: Listing,
): Promise<HypeReelScript> {
  if (!env.anthropicApiKey) return templatedHypeReel(listing);
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  try {
    const message = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 800,
      system:
        "You are a real-estate agent hosting a fast, high-energy social hype reel of your listing. " +
        "Use ONLY the facts provided — never invent rooms, finishes, or numbers. " +
        "Write a punchy on-camera intro (~5s) and a closing CTA (~4s), plus 2-3 very short on-screen callouts.",
      messages: [
        { role: "user", content: JSON.stringify(listingForPrompt(listing)) },
      ],
      output_config: { format: zodOutputFormat(HypeReelSchema) },
    });
    return message.parsed_output ?? templatedHypeReel(listing);
  } catch {
    return templatedHypeReel(listing);
  }
}

function templatedHypeReel(listing: Listing): HypeReelScript {
  const place = [listing.address, listing.city].filter(Boolean).join(", ");
  const intro = `Welcome to ${place || "your next home"} — let's take a look.`;
  const outro = "Want to see it in person? Reach out today.";
  const callouts = (listing.features ?? [])
    .slice(0, 3)
    .map((f) => String(f).slice(0, 24));
  return { intro, outro, featureCallouts: callouts };
}
