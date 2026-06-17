import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";
import { env } from "@/lib/env";
import type { Tables } from "@/lib/types/database";

// Model for all script/narration generation. These are short-copy + single-image
// caption tasks — Haiku 4.5 handles them well at ~10-15x lower cost than Opus.
const SCRIPT_MODEL = "claude-haiku-4-5";

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
      model: SCRIPT_MODEL,
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

/** Reel narration voice: the polished default, or a hyped Gen-Z social style. */
export type ReelStyle = "classic" | "genz";

// Varied fallback openers so even the no-API-key path doesn't repeat one line.
const FALLBACK_OPENERS = [
  "Step into",
  "Over here you've got",
  "Now check out",
  "And just through here,",
  "Look at",
  "Let's move into",
  "Right this way to",
  "Don't miss",
];
const GENZ_FALLBACK_OPENERS = [
  "Okay this is giving",
  "Not me obsessed with",
  "Lowkey can't even with",
  "No cap, look at",
  "This is straight-up elite —",
  "Tell me why",
  "We need to talk about",
  "It's the",
];
function roomLineFallback(i: number, listing: Listing, style: ReelStyle): string {
  const features = (listing.features ?? []).filter(Boolean);
  const openers = style === "genz" ? GENZ_FALLBACK_OPENERS : FALLBACK_OPENERS;
  const opener = openers[i % openers.length];
  if (features[i]) return `${opener} ${features[i]}.`;
  return `${opener} this space.`;
}

const RoomLinesSchema = z.object({
  lines: z
    .array(z.string())
    .describe(
      "One spoken narration line per room photo, in the SAME order as the photos. " +
        "Each line MUST be distinct from the others.",
    ),
});

/**
 * Vision-based per-room narration generated in ONE coherent pass: Claude sees ALL
 * the room photos together (in order) and writes a connected walking-tour line for
 * each — naming the space and a visible detail. Generating them together (not one
 * call per photo) is what kills the redundancy: it can vary every opening and
 * adjective and avoid repeating near-duplicate rooms. Returns one line per photo
 * (padded/truncated to match). `opener` is the intro line, passed so the room
 * lines don't echo the greeting. Falls back to varied lines without a key / on error.
 */
export async function generateRoomNarration(
  roomPhotoUrls: string[],
  listing: Listing,
  opener?: string,
  style: ReelStyle = "classic",
  targetWords: number = 14,
): Promise<string[]> {
  if (!env.anthropicApiKey || roomPhotoUrls.length === 0) {
    return roomPhotoUrls.map((_, i) => roomLineFallback(i, listing, style));
  }
  // Per-line length controls each room clip's duration (clip ≈ words/2.5 sec),
  // which is the user's Length picker — shorter words = snappier, longer = detailed.
  const lo = Math.max(5, targetWords - 3);
  const hi = targetWords + 4;
  const place = listing.address ? ` at ${listing.address}` : "";
  // Interleave a label before each image so Claude maps lines → photos by order.
  type Block =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "url"; url: string } };
  const content: Block[] = [
    {
      type: "text",
      text:
        `You are filming a walking home tour${place}. Here are the ${roomPhotoUrls.length} ` +
        `rooms IN ORDER. Write ONE spoken line per room (${lo}-${hi} words) — what the ` +
        `agent says walking into THAT room.` +
        (opener ? ` The intro already said: "${opener}" — do NOT echo it.` : ""),
    },
  ];
  roomPhotoUrls.forEach((url, i) => {
    content.push({ type: "text", text: `Room ${i + 1}:` });
    content.push({ type: "image", source: { type: "url", url } });
  });

  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const system =
      style === "genz"
        ? "You are a HYPED, enthusiastic Gen-Z real-estate creator filming a home tour " +
          "for TikTok/Reels. For each room photo, write ONE short, high-energy spoken " +
          `line (${lo}-${hi} words) gassing up the space with natural Gen-Z slang — e.g. ` +
          "'boujee', \"it's giving [vibe]\", 'no cap', 'obsessed', 'lowkey/highkey', " +
          "'ate', 'understood the assignment', 'elite', 'unreal', 'main-character energy'. " +
          "Name the room + a visible detail. CRITICAL — every line DISTINCT: vary the " +
          "slang and openings, NEVER reuse the same slang word twice, don't repeat " +
          "features. No greetings or call-to-action. Only what's visible. Authentic hype, " +
          "not cringe — like a real young agent who's genuinely losing it over this place."
        : "You are a charismatic real-estate agent filming a walking home tour. For each " +
          `room photo, write ONE short, natural, spoken line (${lo}-${hi} words): name the ` +
          "space and call out ONE specific detail you can SEE. " +
          "CRITICAL — every line must be DISTINCT: never start two lines the same way " +
          "(absolutely NO repeating 'This stunning…'), do NOT reuse the same adjective " +
          "across lines (vary beyond 'stunning/gorgeous/soaring'), and don't repeat the " +
          "same feature twice even for similar rooms. No greetings and no call-to-action " +
          "(those are separate) — just tour the rooms. Only mention what is visible.";
    const msg = await client.messages.parse({
      model: SCRIPT_MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(RoomLinesSchema) },
    });
    const lines = (msg.parsed_output?.lines ?? [])
      .map((l) => l.trim().replace(/^["']+|["']+$/g, ""))
      .filter(Boolean);
    // Pad/truncate to exactly one line per photo.
    return roomPhotoUrls.map((_, i) => lines[i] || roomLineFallback(i, listing, style));
  } catch {
    return roomPhotoUrls.map((_, i) => roomLineFallback(i, listing, style));
  }
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
export async function generateOpeningPitch(
  listing: Listing,
  style: ReelStyle = "classic",
): Promise<string> {
  if (!env.anthropicApiKey)
    return clampToBudget(templatedOpeningPitch(listing, style));
  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const persona =
      style === "genz"
        ? "You are a HYPED Gen-Z real-estate creator recording the OPENING of a viral " +
          "TikTok/Reels home tour, on camera in front of the house. Talk with huge " +
          "energy and natural Gen-Z slang (e.g. 'no cap', \"it's giving\", 'boujee', " +
          "'obsessed', 'elite', 'this is NOT a drill') while still naming the real stats."
        : "You are a real-estate agent recording the OPENING of a listing reel, " +
          "on camera, standing in front of the house.";
    const ctaExample =
      style === "genz"
        ? "'okay DM me RIGHT now, this one's not gonna last'"
        : "'DM me to see it this weekend'";
    const message = await client.messages.parse({
      model: SCRIPT_MODEL,
      max_tokens: 600,
      system:
        persona +
        " Write ONLY what you SAY out " +
        `loud — calibrated to EXACTLY ${OPENING_PITCH_SECONDS} seconds of natural ` +
        `spoken delivery, which is about ${TARGET_WORDS} words. Use the FULL time: ` +
        `aim for ${TARGET_WORDS} words, at LEAST ${TARGET_WORDS - 5} and never more ` +
        `than ${MAX_WORDS} (the spoken length IS the video length — do not run over, ` +
        "but do NOT come in short and choppy either). Include: a warm greeting, the " +
        "property and its headline numbers (beds/baths/sqft/price), a tease of 2-3 " +
        "real highlights or a sentence on the feel of the home, and a punchy call to " +
        `action (e.g. ${ctaExample}). Conversational, confident, ` +
        "first person, full flowing sentences. Use ONLY the facts provided — never " +
        "invent rooms, finishes, or numbers. Count your words and fill the budget.",
      messages: [{ role: "user", content: JSON.stringify(listingForPrompt(listing)) }],
      output_config: { format: zodOutputFormat(OpeningPitchSchema) },
    });
    const pitch = message.parsed_output?.pitch?.trim();
    return pitch ? clampToBudget(pitch) : clampToBudget(templatedOpeningPitch(listing));
  } catch {
    return clampToBudget(templatedOpeningPitch(listing));
  }
}

function templatedOpeningPitch(listing: Listing, style: ReelStyle = "classic"): string {
  const place = [listing.address, listing.city].filter(Boolean).join(", ");
  const city = listing.city?.trim();
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
  const feature = (listing.features ?? [])[0]?.trim();
  // Built to land at the full ~20s (~50 words) even when a listing has no
  // features — evergreen, always-true lines fill the budget without inventing
  // specifics. clampToBudget keeps it under the hard ceiling.
  if (style === "genz") {
    return [
      `Okay you NEED to see ${place || "this home"}, no cap.`,
      `This place${city ? ` in ${city}` : ""} is straight-up giving main-character energy.`,
      feature ? `The ${feature.toLowerCase()}? Obsessed.` : "It's lowkey unreal inside.",
      specs ? `We're talking ${specs}.` : "The layout absolutely ate.",
      price ? `Priced at ${price}.` : "",
      "DM me right now — this one is NOT gonna last.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `Hi, I'm so excited to show you ${place || "this home"}.`,
    `This home${city ? ` in ${city}` : ""} feels special the moment you step inside.`,
    feature
      ? `You'll love the ${feature.toLowerCase()}.`
      : "It's warm, bright, and full of character.",
    specs ? `You're looking at ${specs}.` : "It's a comfortable, easy-to-love layout.",
    price ? `It's offered at ${price}.` : "",
    "Message me and let's set up a private tour this weekend.",
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
      model: SCRIPT_MODEL,
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
