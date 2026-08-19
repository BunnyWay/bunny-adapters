import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import type { AstroIntegration } from "astro";
import type { BunnyAdapterOptions, RuntimeOptions } from "./types.js";

export type { BunnyAdapterOptions } from "./types.js";

const PACKAGE = "@bunny.net/astro-adapter";

/**
 * Deno provides these under their `node:` names only, so bare imports from
 * dependencies are rewritten during the server build.
 */
const NODE_BUILTINS = [
  "assert", "assert/strict", "async_hooks", "buffer", "console", "constants",
  "crypto", "diagnostics_channel", "dns", "events", "fs", "fs/promises",
  "http", "http2", "https", "module", "net", "os", "path", "path/posix",
  "path/win32", "perf_hooks", "process", "punycode", "querystring",
  "readline", "stream", "stream/promises", "stream/web", "string_decoder",
  "sys", "timers", "timers/promises", "tls", "tty", "url", "util",
  "util/types", "worker_threads", "zlib",
];

export default function bunny(options: BunnyAdapterOptions = {}): AstroIntegration {
  const {
    storageZone = "",
    storageHost = "",
    outfile = "dist/index.js",
    bundle = true,
    imageService = "noop",
    assetCacheControl = "public, max-age=31536000, immutable",
    pageCacheControl = "public, max-age=60",
  } = options;

  const runtime: RuntimeOptions = {
    storageZone,
    storageHost,
    assetCacheControl,
    pageCacheControl,
  };

  let root: URL;
  let serverDir: URL;
  let serverEntry = "entry.mjs";

  return {
    name: PACKAGE,
    hooks: {
      "astro:config:setup": ({ updateConfig, logger }) => {
        if (imageService === "noop") {
          // sharp needs native binaries, which cannot run on the edge.
          updateConfig({
            image: { service: { entrypoint: "astro/assets/services/noop" } },
          });
          logger.info("Using the no-op image service. Pass imageService: false to keep your own.");
        }
        updateConfig({
          vite: {
            define: {
              __BUNNY_ADAPTER_OPTIONS__: JSON.stringify(runtime),
            },
          },
        });
      },

      "astro:config:done": ({ setAdapter, config, logger }) => {
        if (config.output === "static") {
          logger.warn(
            'output is "static", so no server will be built. Set output: "server" to render on the edge.',
          );
        }
        root = config.root;
        serverDir = config.build.server;
        serverEntry = config.build.serverEntry ?? "entry.mjs";

        setAdapter({
          name: PACKAGE,
          entrypointResolution: "auto",
          serverEntrypoint: `${PACKAGE}/server`,
          adapterFeatures: { edgeMiddleware: false },
          supportedAstroFeatures: {
            staticOutput: "stable",
            hybridOutput: "stable",
            serverOutput: "stable",
            sharpImageService: "unsupported",
            envGetSecret: "stable",
          },
        });
      },

      "astro:build:setup": ({ vite, target }) => {
        if (target !== "server") return;
        vite.resolve ??= {};
        const aliases = NODE_BUILTINS.map((name) => ({
          find: new RegExp(`^${name}$`),
          replacement: `node:${name}`,
        }));
        if (Array.isArray(vite.resolve.alias)) {
          vite.resolve.alias = [...vite.resolve.alias, ...aliases];
        } else {
          const existing = (vite.resolve.alias ?? {}) as Record<string, string>;
          for (const name of NODE_BUILTINS) existing[name] = `node:${name}`;
          vite.resolve.alias = existing;
        }
      },

      "astro:build:done": async ({ logger }) => {
        if (!bundle) {
          logger.info(`Skipped bundling. The server entry is ${serverEntry}.`);
          return;
        }

        const entryPoint = fileURLToPath(new URL(serverEntry, serverDir));
        const rootDir = fileURLToPath(root);
        const outPath = path.resolve(rootDir, outfile);

        // Let esbuild find this package's own dependencies when the project's
        // node_modules does not hoist them. Resolving them to a file path here
        // would pick the Node build of the SDK and drag in node-only servers,
        // so the specifier must stay bare and keep the "deno" condition.
        const packageModules = fileURLToPath(new URL("../node_modules", import.meta.url));

        const result = await esbuild.build({
          entryPoints: [entryPoint],
          absWorkingDir: rootDir,
          nodePaths: [packageModules],
          outfile: outPath,
          bundle: true,
          format: "esm",
          target: "esnext",
          platform: "neutral",
          mainFields: ["module", "main"],
          conditions: ["deno", "worker", "import", "module", "default"],
          external: ["node:*"],
          legalComments: "none",
          metafile: true,
          logLevel: "silent",
        });

        // The bundle now holds every server chunk, so the folder is dead weight.
        await rm(fileURLToPath(serverDir), { recursive: true, force: true });

        const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
        const relative = path.relative(rootDir, outPath);
        logger.info(`Bundled to ${relative} (${(bytes / 1024).toFixed(0)} kB, limit 10 MB).`);
        logger.info(`Deploy it with: bunny scripts deploy ${relative}`);
      },
    },
  };
}
