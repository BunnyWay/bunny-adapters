/**
 * The Astro integration. Everything here runs while the site builds, and none
 * of it reaches the deployed script.
 */
import { fileURLToPath } from "node:url";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AstroIntegration, RouteToHeaders } from "astro";
import { SIZE_LIMIT, bundleServer, formatSize, relativeTo, NODE_BUILTINS } from "./build/bundle.js";
import { buildManifest } from "./build/manifest.js";
import { normalizeBase } from "./runtime/paths.js";
import type { RuntimeOptions } from "./runtime/types.js";
import type { BunnyAdapterOptions } from "./types.js";

export type {
  BunnyAdapterOptions,
  BunnyImageServiceConfig,
  BunnyRuntime,
  ImageServiceMode,
} from "./types.js";
export type { BunnyCacheConfig } from "./cache.js";
export type { BunnySessionConfig } from "./session.js";

const PACKAGE = "@bunny.net/astro-adapter";

/** Above this many client files, the manifest costs more than it saves. */
const DEFAULT_MANIFEST_LIMIT = 20_000;

export default function bunny(options: BunnyAdapterOptions = {}): AstroIntegration {
  const {
    storageZone = "",
    storageHost = "",
    outfile = "dist/index.js",
    bundle = true,
    imageService = "noop",
    assetCacheControl = "public, max-age=31536000, immutable",
    pageCacheControl = "public, max-age=60",
    serverCacheControl = "private, no-store",
    sessions = true,
    cache = true,
    assetManifest = true,
  } = options;

  const runtime: RuntimeOptions = {
    storageZone,
    storageHost,
    // Filled in from the resolved config, below.
    base: "",
    assetCacheControl,
    pageCacheControl,
    serverCacheControl,
  };

  const manifestLimit =
    assetManifest === false
      ? 0
      : typeof assetManifest === "number"
        ? assetManifest
        : DEFAULT_MANIFEST_LIMIT;

  let root: URL;
  let clientDir: URL;
  let serverDir: URL;
  let serverEntry = "entry.mjs";
  let outDir: URL;
  let routeToHeaders: RouteToHeaders | null = null;

  return {
    name: PACKAGE,
    hooks: {
      "astro:config:setup": ({ config, updateConfig, logger }) => {
        // The client build has no `base` prefix on disk, and every request
        // carries one. The script needs to know the prefix to remove it.
        runtime.base = normalizeBase(config.base);

        if (imageService === "bunny") {
          updateConfig({
            image: {
              service: {
                entrypoint: `${PACKAGE}/image-service`,
                config: options.image ?? {},
              },
            },
          });
          logger.warn(
            "Images go through Bunny Optimizer, and Optimizer cannot read from an " +
              "Edge Script yet. With Optimizer on, an image that misses the CDN cache " +
              "answers 523. Leave imageService at its default until that is fixed.",
          );
        } else if (imageService === "noop") {
          // sharp needs native binaries, which cannot run on the edge.
          updateConfig({
            image: { service: { entrypoint: "astro/assets/services/noop" } },
          });
          logger.info('Images are not transformed. Pass imageService: "bunny" to use Optimizer.');
        }

        // Only fill a gap. A project that picked its own driver keeps it.
        if (sessions && config.session !== false && !config.session?.driver) {
          updateConfig({
            session: { driver: { entrypoint: `${PACKAGE}/session` } },
          } as Parameters<typeof updateConfig>[0]);
        }

        if (cache && !config.cache?.provider) {
          updateConfig({
            cache: { provider: { name: "bunny", entrypoint: `${PACKAGE}/cache` } },
          } as Parameters<typeof updateConfig>[0]);
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
        outDir = config.outDir;
        clientDir = config.build.client;
        serverDir = config.build.server;
        serverEntry = config.build.serverEntry ?? "entry.mjs";

        setAdapter({
          name: PACKAGE,
          entrypointResolution: "auto",
          serverEntrypoint: `${PACKAGE}/server`,
          previewEntrypoint: `${PACKAGE}/preview`,
          adapterFeatures: {
            // Bunny Storage cannot hold a headers file, so the script applies
            // them when it serves a prerendered page.
            staticHeaders: true,
          },
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

      "astro:build:generated": ({ routeToHeaders: headers }) => {
        // Held until the bundle step, which is where they can be inlined.
        routeToHeaders = headers;
      },

      "astro:build:done": async ({ logger }) => {
        if (!bundle) {
          logger.info(`Skipped bundling. The server entry is ${serverEntry}.`);
          return;
        }

        const rootDir = fileURLToPath(root);
        const outPath = path.resolve(rootDir, outfile);
        const manifest = await buildManifest(
          clientDir,
          routeToHeaders,
          manifestLimit,
          runtime.base,
        );

        const { bytes } = await bundleServer({
          entryPoint: fileURLToPath(new URL(serverEntry, serverDir)),
          rootDir,
          outPath,
          manifest,
          options,
        });

        // The bundle now holds every server chunk, so the folder is dead weight.
        // Unless the bundle was written into it: removing the folder would then
        // delete the file this step just reported, and the build would still
        // succeed. Keep the folder and say why.
        // `resolve` drops the trailing slash a directory URL carries, so the
        // comparison below has a separator on exactly one side.
        const serverPath = path.resolve(fileURLToPath(serverDir));
        if (outPath.startsWith(serverPath + path.sep)) {
          logger.warn(
            `outfile is inside ${relativeTo(rootDir, serverPath)}, so the server output was kept. ` +
              "Point outfile somewhere else to have it cleared away.",
          );
        } else {
          await rm(serverPath, { recursive: true, force: true });
        }

        // What `astro preview` needs to find the bundle again.
        await writeFile(
          fileURLToPath(new URL(".bunny-adapter.json", outDir)),
          JSON.stringify(
            {
              outfile: relativeTo(rootDir, outPath),
              client: relativeTo(rootDir, fileURLToPath(clientDir)),
            },
            null,
            2,
          ),
        );

        const relative = relativeTo(rootDir, outPath);
        if (bytes > SIZE_LIMIT) {
          logger.error(
            `${relative} is ${formatSize(bytes)}. Edge Scripting refuses anything above 10 MB.`,
          );
        } else {
          logger.info(`Bundled to ${relative} (${formatSize(bytes)}, limit 10 MB).`);
        }

        if (manifest.assets) {
          logger.info(
            `Inlined ${manifest.assets.length} client file(s), so misses cost no lookup.`,
          );
        }
        if (manifest.redirects) {
          const count = new Set(Object.values(manifest.redirects)).size;
          logger.info(`Answering ${count} prerendered redirect(s) in the script.`);
        }
        logger.info(`Deploy it with: npx bunny-astro deploy`);
      },
    },
  };
}
