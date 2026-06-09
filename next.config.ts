import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The cinematic pipeline shells out to a bundled static ffmpeg (cinematic clip
  // stitching + narration mux). Next's tracer can miss the binary because it's
  // referenced as a runtime path, so include it explicitly for the routes that
  // run it — the cron reconciler and the /videos/[id] server actions.
  outputFileTracingIncludes: {
    "/api/cron/reconcile-videos": ["./node_modules/ffmpeg-static/**"],
    "/videos/[id]": ["./node_modules/ffmpeg-static/**"],
  },
};

export default nextConfig;
