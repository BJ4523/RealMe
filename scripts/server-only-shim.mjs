// Node ESM loader hook: resolves the `server-only` marker package (provided by
// Next.js at build time, not installed standalone) to an empty module so that
// server-side lib/*.ts files can be imported directly from smoke scripts run
// under `node --experimental-strip-types`.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const empty = pathToFileURL(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "node_modules/next/dist/compiled/server-only/empty.js",
  ),
).href;

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function tryResolve(candidates, context, next) {
  for (const c of candidates) {
    try {
      return await next(c, context);
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier === "server-only" || specifier === "client-only") {
    return { url: empty, shortCircuit: true };
  }
  // Resolve the "@/..." tsconfig path alias to the project root so server lib
  // modules (which import via "@/lib/...") run directly under type-stripping.
  if (specifier.startsWith("@/")) {
    const base = pathToFileURL(join(projectRoot, specifier.slice(2))).href;
    if (/\.[a-z]+$/i.test(specifier)) return next(base, context);
    const hit = await tryResolve(
      [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base],
      context,
      next,
    );
    if (hit) return hit;
  }
  // Map extensionless relative TS imports (e.g. "./kenburns") to "<spec>.ts" so
  // the experimental type-stripping resolver finds the sibling source file.
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
    const hit = await tryResolve(
      [`${specifier}.ts`, `${specifier}.tsx`, `${specifier}/index.ts`],
      context,
      next,
    );
    if (hit) return hit;
  }
  return next(specifier, context);
}
