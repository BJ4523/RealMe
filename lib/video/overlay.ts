/**
 * Pure builder: listing facts + a beat grid -> an ffmpeg `drawtext` filter chain
 * that fades kinetic overlays in/out on the beat. No I/O. The font is bundled
 * (see assets/fonts/HypeReel.ttf); pass its absolute path as `fontFile`.
 */
export interface Overlay {
  text: string;
  startMs: number;
  endMs: number;
  /** Vertical lane: bottom third by default; price/address pinned. */
  lane: "price" | "stats" | "address" | "feature";
}

const LANE_Y: Record<Overlay["lane"], string> = {
  price: "h*0.10",
  address: "h*0.20",
  stats: "h*0.82",
  feature: "h*0.74",
};
const LANE_SIZE: Record<Overlay["lane"], number> = {
  price: 72,
  address: 34,
  stats: 40,
  feature: 44,
};

/** Escape text for ffmpeg drawtext (colons, quotes, backslashes, %). */
export function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

/**
 * Build overlays from listing data. `featureCallouts` come from the script model;
 * the rest are structured facts. Each overlay shows for ~2 beats from its start.
 */
export function overlaysFromListing(input: {
  price: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  address: string | null;
  featureCallouts: string[];
  beatGrid: number[]; // absolute ms timestamps within the montage window
  showDurMs: number;
}): Overlay[] {
  const out: Overlay[] = [];
  const g = input.beatGrid;
  const at = (i: number) => g[Math.min(i, g.length - 1)] ?? 0;
  const span = (i: number): [number, number] => [at(i), at(i) + input.showDurMs];

  if (input.price) {
    const [s, e] = span(0);
    out.push({ text: input.price, startMs: s, endMs: e, lane: "price" });
  }
  if (input.address) {
    const [s, e] = span(0);
    out.push({ text: input.address, startMs: s, endMs: e, lane: "address" });
  }
  const stats = [
    input.beds ? `${input.beds} BD` : null,
    input.baths ? `${input.baths} BA` : null,
    input.sqft ? `${input.sqft.toLocaleString("en-US")} SQFT` : null,
  ]
    .filter(Boolean)
    .join("   ");
  if (stats) {
    const [s, e] = span(2);
    out.push({ text: stats, startMs: s, endMs: e, lane: "stats" });
  }
  input.featureCallouts.slice(0, 3).forEach((f, i) => {
    const [s, e] = span(4 + i * 2);
    out.push({ text: f, startMs: s, endMs: e, lane: "feature" });
  });
  return out;
}

/** Build the drawtext filter chain applied over a [in] video label -> [out]. */
export function buildOverlayFilter(
  inLabel: string,
  outLabel: string,
  overlays: Overlay[],
  fontFile: string,
): string {
  if (overlays.length === 0) return `${inLabel}null${outLabel}`;
  const font = fontFile.replace(/\\/g, "/").replace(/:/g, "\\:");
  const draws = overlays
    .map((o) => {
      const t0 = (o.startMs / 1000).toFixed(3);
      const t1 = (o.endMs / 1000).toFixed(3);
      // 0.3s fade in/out via alpha ramp; white text, semi-opaque dark box.
      const alpha =
        `if(lt(t,${t0}),0,` +
        `if(lt(t,${(o.startMs / 1000 + 0.3).toFixed(3)}),(t-${t0})/0.3,` +
        `if(lt(t,${(o.endMs / 1000 - 0.3).toFixed(3)}),1,` +
        `if(lt(t,${t1}),(${t1}-t)/0.3,0))))`;
      return (
        `drawtext=fontfile='${font}':text='${escapeDrawtext(o.text)}':` +
        `fontcolor=white:fontsize=${LANE_SIZE[o.lane]}:` +
        `x=(w-text_w)/2:y=${LANE_Y[o.lane]}:` +
        `box=1:boxcolor=black@0.45:boxborderw=18:` +
        `alpha='${alpha}':enable='between(t,${t0},${t1})'`
      );
    })
    .join(",");
  return `${inLabel}${draws}${outLabel}`;
}
