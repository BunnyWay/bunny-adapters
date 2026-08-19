import type { BuildOptions } from "esbuild";

export type { BuildManifest, BunnyRuntime, RuntimeOptions } from "./runtime/types.js";

/**
 * How images are transformed.
 *
 * - `"noop"` leaves every image at its original size. The default, because it
 *   costs nothing and needs no pull zone feature.
 * - `"bunny"` uses [Bunny
 *   Optimizer](https://bunny.net/docs/optimizer), which resizes and re-encodes
 *   at the edge. Turn Optimizer on for the pull zone first. It is a paid
 *   feature, so the adapter never enables it for you.
 * - `false` keeps whatever the project already configures. Use it when you want
 *   `sharp` for prerendered pages, and you never render an image on demand.
 */
export type ImageServiceMode = "noop" | "bunny" | false;

export interface BunnyImageServiceConfig {
  /** Widths used to build a `srcset`. */
  widths?: number[];
  /** Default quality, 1 to 100. Optimizer decides when this is absent. */
  quality?: number;
  /**
   * Largest width the service will ask for. A request above it is clamped, so a
   * crafted URL cannot make the Optimizer render a huge image.
   * @default 3840
   */
  maxWidth?: number;
}

export interface BunnyAdapterOptions {
  /**
   * Storage zone that holds `dist/client`.
   * Defaults to the `BUNNY_STORAGE_ZONE` environment variable at runtime.
   */
  storageZone?: string;

  /**
   * Storage endpoint for that zone's region, for example `ny.storage.bunnycdn.com`.
   * Defaults to the `BUNNY_STORAGE_HOST` environment variable, then
   * `storage.bunnycdn.com`.
   */
  storageHost?: string;

  /**
   * Where to write the single deployable file, relative to the project root.
   * @default "dist/index.js"
   */
  outfile?: string;

  /**
   * Bundle the server output into one file after the build.
   * Turn this off only if you run your own bundler.
   * @default true
   */
  bundle?: boolean;

  /**
   * Which image service to use.
   * @default "noop"
   */
  imageService?: ImageServiceMode;

  /** Settings for the Bunny Optimizer image service. Ignored otherwise. */
  image?: BunnyImageServiceConfig;

  /** `Cache-Control` for hashed assets. @default "public, max-age=31536000, immutable" */
  assetCacheControl?: string;

  /** `Cache-Control` for prerendered HTML. @default "public, max-age=60" */
  pageCacheControl?: string;

  /**
   * Store sessions in the storage zone when the project turns sessions on.
   * Set it to `false` to configure your own driver.
   * @default true
   */
  sessions?: boolean;

  /**
   * Register the bunny.net CDN cache provider, which turns Astro's
   * `routeRules` into `Cache-Control` and `CDN-Tag` headers, and purges by tag.
   * Set it to `false` to configure your own provider.
   * @default true
   */
  cache?: boolean;

  /**
   * Inline the list of built client files into the bundle, so the script knows
   * what Storage holds without asking. Pass a number to change the file count
   * above which the adapter gives up and probes instead.
   * @default 20000
   */
  assetManifest?: boolean | number;

  /** Modules esbuild must not bundle. They have to exist at runtime. */
  external?: string[];

  /**
   * Emit a source map beside the bundle. `"inline"` keeps one file, at the cost
   * of size against the 10 MB limit.
   * @default false
   */
  sourcemap?: boolean | "inline" | "external" | "linked";

  /**
   * Last resort. Change the esbuild options before the bundle is written.
   * Mutate the object, or return a new one.
   */
  esbuild?: (options: BuildOptions) => BuildOptions | void;
}
