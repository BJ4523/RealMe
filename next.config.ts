import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static locates its binary via __dirname. If Next/Turbopack BUNDLES it,
  // __dirname is rewritten and the binary path becomes bogus (e.g. /ROOT/...) ->
  // "spawn ffmpeg ENOENT". Keep it external so __dirname resolves to real
  // node_modules at runtime (fixes local dev AND prod).
  serverExternalPackages: ["ffmpeg-static"],
  // Also ensure the binary is traced into the serverless functions that run it
  // (the cron reconciler and the /videos/[id] server actions).
  outputFileTracingIncludes: {
    "/api/cron/reconcile-videos": ["./node_modules/ffmpeg-static/**"],
    "/videos/[id]": ["./node_modules/ffmpeg-static/**"],
  },
};

export default nextConfig;
