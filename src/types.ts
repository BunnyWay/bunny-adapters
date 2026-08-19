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
   * Replace the default `sharp` image service, which cannot run on the edge.
   * Pass `false` to keep whatever the project already configures.
   * @default "noop"
   */
  imageService?: "noop" | false;

  /** `Cache-Control` for hashed assets. @default "public, max-age=31536000, immutable" */
  assetCacheControl?: string;

  /** `Cache-Control` for prerendered HTML. @default "public, max-age=60" */
  pageCacheControl?: string;
}

/** The subset of the options that the runtime needs, frozen in at build time. */
export interface RuntimeOptions {
  storageZone: string;
  storageHost: string;
  assetCacheControl: string;
  pageCacheControl: string;
}
