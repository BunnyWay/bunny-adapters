/**
 * Types the runtime shares with the build. Nothing here may import a build-only
 * module, because `src/server.ts` ends up inside the deployed script.
 */

/** The subset of the options the runtime needs. Frozen in at build time. */
export interface RuntimeOptions {
  storageZone: string;
  storageHost: string;
  assetCacheControl: string;
  pageCacheControl: string;
  serverCacheControl: string;
}

/**
 * What the build knows and the runtime cannot work out for itself. The adapter
 * inlines this when it bundles, so it is absent when `bundle: false`.
 */
export interface BuildManifest {
  /**
   * Every file in `dist/client`, as a POSIX path with no leading slash.
   * `null` when the build has too many files to inline; the script then probes
   * Storage instead.
   */
  assets: string[] | null;
  /**
   * Extra response headers for a prerendered page, keyed by object path.
   * Astro produces these when `staticHeaders` is on, for example a content
   * security policy. Bunny Storage cannot hold them, so the script adds them.
   */
  headers: Record<string, [string, string][]> | null;
}

/**
 * `Astro.locals.runtime`. Everything the bunny.net edge knows about a request.
 *
 * Add it to your project's types:
 *
 * ```ts
 * // src/env.d.ts
 * type BunnyRuntime = import("@bunny.net/astro-adapter").BunnyRuntime;
 * declare namespace App {
 *   interface Locals {
 *     runtime: BunnyRuntime;
 *   }
 * }
 * ```
 */
export interface BunnyRuntime {
  /**
   * The visitor's country, as an ISO 3166-1 alpha-2 code. Read from the
   * `cdn-requestcountrycode` header, which only the bunny.net network adds.
   */
  country: string | undefined;

  /** The bunny.net request id. Quote it in a support ticket. */
  requestId: string | undefined;

  /** The visitor's IP address. The same value as `Astro.clientAddress`. */
  clientAddress: string | undefined;

  /**
   * Keep the isolate alive for background work after the response is sent.
   * A no-op away from the bunny.net network, so local runs behave the same.
   *
   * @see https://bunny.net/docs/scripting/runtime#waituntil
   */
  waitUntil(promise: Promise<unknown>): void;

  /**
   * The edge Cache API, when the platform provides it.
   *
   * @see https://bunny.net/docs/scripting/cache
   */
  caches: CacheStorage | undefined;

  /** Read a script environment variable or secret. */
  env(key: string): string | undefined;
}
