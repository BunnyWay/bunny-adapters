/**
 * The esbuild step that turns Astro's server output into the single file Edge
 * Scripting accepts.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as esbuild from "esbuild";
import type { BuildOptions } from "esbuild";
import type { BuildManifest } from "../runtime/types.js";
import type { BunnyAdapterOptions } from "../types.js";

/**
 * Deno provides these under their `node:` names only, so a bare import from a
 * dependency is rewritten during the server build.
 */
export const NODE_BUILTINS = [
  "assert",
  "assert/strict",
  "async_hooks",
  "buffer",
  "console",
  "constants",
  "crypto",
  "diagnostics_channel",
  "dns",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "stream",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "sys",
  "timers",
  "timers/promises",
  "tls",
  "tty",
  "url",
  "util",
  "util/types",
  "worker_threads",
  "zlib",
];

/** Edge Scripting refuses a script above this size. */
export const SIZE_LIMIT = 10 * 1024 * 1024;

export interface BundleParams {
  /** Astro's server entry, for example `dist/server/entry.mjs`. */
  entryPoint: string;
  /** The project root. Relative paths resolve against it. */
  rootDir: string;
  /** Where the single file goes. */
  outPath: string;
  /** Inlined so the script knows what the build produced. */
  manifest: BuildManifest;
  options: BunnyAdapterOptions;
}

export interface BundleResult {
  bytes: number;
}

/** Bundle the server for the Edge Scripting runtime, which is Deno. */
export async function bundleServer(params: BundleParams): Promise<BundleResult> {
  const { entryPoint, rootDir, outPath, manifest, options } = params;

  // Let esbuild find this package's own dependencies when the project's
  // node_modules does not hoist them. Resolving them to a file path here would
  // pick the Node build of the SDK and drag in node-only servers, so the
  // specifier must stay bare and keep the runtime condition.
  const packageModules = fileURLToPath(new URL("../../node_modules", import.meta.url));

  let buildOptions: BuildOptions = {
    entryPoints: [entryPoint],
    absWorkingDir: rootDir,
    nodePaths: [packageModules],
    outfile: outPath,
    bundle: true,
    format: "esm",
    target: "esnext",
    // The runtime provides only what the `node:` prefix names.
    platform: "neutral",
    mainFields: ["module", "main"],
    // The `deno` condition is what picks the SDK's edge build. Without it the
    // bundle drags in a Node HTTP server that cannot run on the edge.
    conditions: ["deno", "worker", "import", "module", "default"],
    external: ["node:*", ...(options.external ?? [])],
    define: {
      // The client build is on disk by now, so the script can be told what it
      // holds. `typeof` in the runtime keeps this optional.
      __BUNNY_BUILD_MANIFEST__: JSON.stringify(manifest),
    },
    sourcemap: options.sourcemap === true ? "linked" : (options.sourcemap ?? false),
    legalComments: "none",
    metafile: true,
    logLevel: "silent",
  };

  if (options.esbuild) {
    buildOptions = options.esbuild(buildOptions) ?? buildOptions;
  }

  const result = await esbuild.build(buildOptions);
  const bytes = Object.values(result.metafile?.outputs ?? {})[0]?.bytes ?? 0;
  return { bytes };
}

/** A short, readable size, for the build log. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(0)} kB`;
}

/** The path to show a user, relative to where they ran the build. */
export function relativeTo(rootDir: string, target: string): string {
  return path.relative(rootDir, target).split(path.sep).join("/");
}
