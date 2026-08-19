/**
 * What the build knows and the script cannot work out for itself.
 *
 * The script has no disk, so without this it has to ask Storage whether a file
 * exists. Inlining the list turns a guess into a lookup.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { RouteToHeaders } from "astro";
import { objectCandidates } from "../runtime/paths.js";
import type { BuildManifest } from "../runtime/types.js";

/** Every file under `dir`, as POSIX paths relative to it. */
export async function listFiles(dir: string, base = dir): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // A site with no client output at all is unusual, but not an error.
    return [];
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFiles(full, base);
      return [path.relative(base, full).split(path.sep).join("/")];
    }),
  );
  return nested.flat();
}

/**
 * Turn Astro's route-to-headers map into an object-path map.
 *
 * Astro keys it by route pathname, and the script sees object paths. The build
 * format decides which of the two candidates a page was written as, so both are
 * registered and the one that exists wins.
 */
export function headersByObject(
  routeToHeaders: RouteToHeaders,
): Record<string, [string, string][]> {
  const result: Record<string, [string, string][]> = {};

  for (const [pathname, payload] of routeToHeaders) {
    const entries = [...payload.headers.entries()].filter(
      // The script works the content type out from the object's extension, and
      // its answer carries a charset. Astro's plain `text/html` would lose it.
      ([name]) => name.toLowerCase() !== "content-type",
    ) as [string, string][];
    if (entries.length === 0) continue;
    for (const object of objectCandidates(pathname)) {
      result[object] = entries;
    }
  }
  return result;
}

/**
 * Build the manifest that gets inlined into the bundle.
 *
 * A very large site gets `assets: null`, and the script goes back to probing
 * Storage. Ten thousand paths cost roughly 300 kB of the 10 MB budget, so the
 * limit protects the script rather than the build.
 */
export async function buildManifest(
  clientDir: URL,
  routeToHeaders: RouteToHeaders | null,
  limit: number,
): Promise<BuildManifest> {
  const files = await listFiles(fileURLToPath(clientDir));
  const headers = routeToHeaders ? headersByObject(routeToHeaders) : null;

  return {
    assets: files.length > limit ? null : files.sort(),
    headers: headers && Object.keys(headers).length > 0 ? headers : null,
  };
}
