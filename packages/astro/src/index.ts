/**
 * The Astro integration. Everything here runs while the site builds, and none
 * of it reaches the deployed script.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AstroIntegration, RouteToHeaders } from "astro";
import {
  SIZE_LIMIT,
  START_RISK_SIZE,
  bundleServer,
  formatSize,
  relativeTo,
  NODE_BUILTINS,
  type BundleContributor,
} from "./build/bundle.js";
import { MANIFEST_VERSION, writeBuildManifest } from "./build/deploy-manifest.js";
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

/**
 * Routes Astro injects into every project, used or not.
 *
 * They render per request, so counting them would make every project look like
 * it needs a server. `/_image` is only reached by a page that renders on demand;
 * `/_server-islands/[name]` only by a page holding a `server:defer` component;
 * and `/404` is Astro's own answer for a project that wrote no 404 page. A
 * project whose own `404.astro` is prerendered reports that route as prerendered,
 * and a project that renders one per request reports it as its own.
 *
 * A project with an island and nothing else on demand has to say so with
 * `deploy: "server"`, because nothing in the route list tells them apart.
 */
const ALWAYS_INJECTED = new Set(["/_image", "/_server-islands/[name]", "/404"]);

/**
 * Above this many client files, the manifest costs more than it saves.
 *
 * Every path is bytes in a script that has a real budget: 8824 of them cost
 * 410 kB, and a script near 8 MB does not start. So the default is the number
 * whose cost stays small next to that budget, and a site with more files probes
 * Storage for a miss instead.
 */
const DEFAULT_MANIFEST_LIMIT = 5_000;

const require = createRequire(import.meta.url);

/** A package's version, or undefined when it cannot be read. Never throws: this is only for a label. */
function versionOf(specifier: string, from?: string): string | undefined {
  try {
    const resolver = from ? createRequire(from) : require;
    return (resolver(specifier) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

/** Images Astro copied without transforming them, when it had a chance to. */
const IMAGE_FILE = /\.(?:png|jpe?g|webp|avif|gif|tiff?)$/i;

/** The "what filled it" half of the message for a script above the limit. */
function largestList(largest: BundleContributor[]): string {
  if (largest.length === 0) return "";
  const rows = largest.map((entry) => `  ${formatSize(entry.bytes).padStart(8)}  ${entry.name}`);
  return `The largest parts of it are:\n${rows.join("\n")}\n`;
}

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
    deploy = "auto",
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
  let astroVersion: string | undefined;
  /**
   * How many routes render per request. `null` until the routes are resolved.
   *
   * `config.output` cannot answer this. Since Astro 5, `output: "static"` is the
   * default and a page leaves it with `export const prerender = false`, so a
   * static-output project can still hold routes that need a server. Deciding
   * from `output` deployed those projects as files, and every dynamic route went
   * missing without a word.
   */
  let onDemandRoutes: number | null = null;
  /** Only used when the routes cannot be counted, on an Astro without that hook. */
  let outputMode: string | undefined;

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

      "astro:config:done": ({ setAdapter, config }) => {
        root = config.root;
        outDir = config.outDir;
        outputMode = config.output;
        astroVersion = versionOf("astro/package.json", fileURLToPath(new URL("./", config.root)));
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

      // The only hook that knows which routes need a server. It runs before the
      // build, so `astro:build:done` can say what to deploy.
      "astro:routes:resolved": ({ routes }) => {
        onDemandRoutes = routes.filter(
          (route) =>
            !route.isPrerendered &&
            !(route.origin === "internal" && ALWAYS_INJECTED.has(route.pattern)),
        ).length;
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

        // Only the routes know whether this project needs a server at all.
        const rendersOnDemand =
          deploy === "server" ||
          (onDemandRoutes === null ? outputMode !== "static" : onDemandRoutes > 0);

        // A prerendered site is not always servable as plain files. Bunny Storage
        // holds objects and nothing else: it cannot answer a 404 with the page
        // Astro built for it, cannot redirect, and cannot add a header. The
        // script does all three, so anything that needs one needs the script.
        const has404 = ["404.html", "404/index.html"].some((name) =>
          existsSync(new URL(name, clientDir)),
        );
        const scriptDoes = [
          ...(has404 ? ["answers a missing page with your 404 page"] : []),
          ...(manifest.redirects
            ? [`sends ${new Set(Object.values(manifest.redirects)).size} prerendered redirect(s)`]
            : []),
          ...(manifest.headers
            ? [`adds the headers ${Object.keys(manifest.headers).length} path(s) ask for`]
            : []),
        ];
        const needsScript = rendersOnDemand || scriptDoes.length > 0;

        const { bytes, largest } = await bundleServer({
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
        if (!needsScript) {
          // Nothing is deployed from this file, so its size is nobody's problem.
          logger.info(
            `Every route is prerendered: \`bunny deploy\` uploads ${relativeTo(rootDir, fileURLToPath(clientDir))}, and deploys no script. ` +
              `${relative} is there for \`astro preview\` (${formatSize(bytes)}).`,
          );
          logger.info(
            'A `server:defer` component needs the script. If this site has one, pass deploy: "server".',
          );
        } else if (bytes > SIZE_LIMIT) {
          // A build whose script cannot be deployed has not succeeded. Failing
          // here costs a developer one build; finding out at the deploy costs
          // them the deploy, and the site it half-created.
          throw new Error(
            `${relative} is ${formatSize(bytes)}, and Edge Scripting takes ${formatSize(SIZE_LIMIT)}.\n\n` +
              `${largestList(largest)}\n` +
              "A package that only runs at build time does not belong in the server. Two things usually help:\n" +
              "  - Prerender the routes that do not need a server: `export const prerender = true`.\n" +
              "  - Keep a heavy dependency out of a page, and out of anything a page imports.",
          );
        } else if (!rendersOnDemand) {
          logger.info(
            `Every route is prerendered. The script is deployed with them because it ` +
              `${scriptDoes.join(", and ")}. Bundled to ${relative} (${formatSize(bytes)}, limit ${formatSize(SIZE_LIMIT)}).`,
          );
        } else {
          logger.info(
            `Bundled to ${relative} (${formatSize(bytes)}, limit ${formatSize(SIZE_LIMIT)}).` +
              (onDemandRoutes ? ` ${onDemandRoutes} route(s) render per request.` : ""),
          );
        }

        // The documented limit is 10 MB, and a script well under it can still
        // fail to start. Saying nothing here leaves a green build and a site that
        // answers 400 with no body.
        if (needsScript && bytes > START_RISK_SIZE) {
          logger.warn(
            `${relative} is ${formatSize(bytes)}, and a script this large often fails to start. ` +
              "The edge then answers 400 with an empty body. Measured in August 2026: the same code " +
              "served every request at 7.4 MB, and none at 7.8 MB. Prerender a route, or drop a " +
              "dependency the server does not need.",
          );
        }

        if (manifest.assets) {
          logger.info(
            `Inlined ${manifest.assets.length} client file(s), so misses cost no lookup.`,
          );
        }

        // `noop` is the default because a transform on demand needs `sharp`, and
        // `sharp` needs native binaries the edge does not have. A build with no
        // route on demand never asks for one, so it can have the real thing and
        // upload far less. Measured on astro.build: 1.3 GB of images went up
        // untouched.
        if (imageService === "noop" && !rendersOnDemand && manifest.assets) {
          const images = manifest.assets.filter((file) => IMAGE_FILE.test(file)).length;
          if (images > 0) {
            logger.info(
              `${images} image(s) went into the build untransformed. Every route here is prerendered, ` +
                "so `imageService: false` lets sharp resize them while the site builds, and the deploy carries less.",
            );
          }
        }
        if (manifest.redirects) {
          const count = new Set(Object.values(manifest.redirects)).size;
          logger.info(`Answering ${count} prerendered redirect(s) in the script.`);
        }

        // What `bunny deploy` reads. The CLI knows no framework, so everything
        // it needs about this build has to be in here.
        const manifestFile = await writeBuildManifest(rootDir, {
          manifestVersion: MANIFEST_VERSION,
          adapter: { package: PACKAGE, version: versionOf("../package.json") },
          framework: { name: "astro", version: astroVersion },
          kind: needsScript ? "ssr" : "static",
          // A static build has nothing to deploy but its files. Naming a script
          // here would have the CLI upload one that never runs.
          ...(needsScript ? { script: { entry: relative, type: "standalone", bytes } } : {}),
          assets: { dir: relativeTo(rootDir, fileURLToPath(clientDir)) },
          requires: {
            // No `cliVersion` floor yet. `manifestVersion` already stops a CLI
            // that cannot read this shape, and a CLI without `bunny deploy` has
            // no command to run. Set a floor here once a released CLI version
            // needs to be ruled out.
            pullZone: {
              // `Astro.cookies.set()` reaches nobody while the pull zone strips
              // Set-Cookie, and nothing in the zone says why.
              disableCookies: false,
              // Smart Cache caches known static extensions only, so it never
              // caches a page, and a `routeRules` entry does nothing while it is
              // on. The adapter protects a private page another way: a server
              // response that sets no Cache-Control gets `private, no-store`.
              enableSmartCache: false,
            },
            ...(sessions ? { storage: { write: true, reason: "Astro.session" } } : {}),
            env: [
              { name: "BUNNY_STORAGE_ZONE", reason: "the zone holding the client build" },
              { name: "BUNNY_STORAGE_HOST", reason: "that zone's regional endpoint" },
              {
                name: "BUNNY_STORAGE_KEY",
                reason: "that zone's read-only password",
                secret: true,
              },
              ...(sessions
                ? [
                    { name: "BUNNY_SESSION_ZONE", reason: "Astro.session", optional: true },
                    {
                      name: "BUNNY_SESSION_KEY",
                      reason: "Astro.session, a password that can write",
                      secret: true,
                      optional: true,
                    },
                  ]
                : []),
              ...(cache
                ? [
                    {
                      name: "BUNNY_PULLZONE_ID",
                      reason: "Astro.cache.invalidate()",
                      optional: true,
                    },
                    {
                      name: "BUNNY_API_KEY",
                      reason: "Astro.cache.invalidate()",
                      secret: true,
                      optional: true,
                    },
                  ]
                : []),
            ],
          },
          dev: { command: "astro dev", preview: "astro preview" },
        });
        logger.info(`Wrote ${manifestFile}. Deploy it with: bunny deploy`);
      },
    },
  };
}
