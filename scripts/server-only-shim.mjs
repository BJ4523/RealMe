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

export async function resolve(specifier, context, next) {
  if (specifier === "server-only" || specifier === "client-only") {
    return { url: empty, shortCircuit: true };
  }
  // Map extensionless relative TS imports (e.g. "./kenburns") to "<spec>.ts" so
  // the experimental type-stripping resolver finds the sibling source file.
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      // fall through to default resolution
    }
  }
  return next(specifier, context);
}
