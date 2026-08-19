/**
 * The runtime entrypoint. This is what actually runs inside the Edge Script.
 *
 * Astro renders every route it owns. Everything else — hashed assets and
 * prerendered pages — is read from Bunny Storage, because the edge has no build
 * output on disk.
 *
 * Keep this file small. A script has 500 ms to start.
 */
import { createApp } from "astro/app/entrypoint";
import { setGetEnv } from "astro/env/setup";
import * as BunnySDK from "@bunny.net/edgescript-sdk";
import { contentType, isHtml } from "./runtime/mime.js";
import { objectCandidates, resolveObject } from "./runtime/paths.js";
import { createStorage } from "./runtime/storage.js";
import type { BuildManifest, BunnyRuntime, RuntimeOptions } from "./runtime/types.js";

/** Replaced with a literal by Vite, from the adapter options. */
declare const __BUNNY_ADAPTER_OPTIONS__: RuntimeOptions;

/**
 * Replaced with a literal by esbuild, after the client build is on disk.
 * Absent when the user turns bundling off, so every read goes through `typeof`.
 */
declare const __BUNNY_BUILD_MANIFEST__: BuildManifest | undefined;

declare const Bunny: { v1?: { waitUntil?(promise: Promise<unknown>): void } } | undefined;
declare const Deno: { env: { get(key: string): string | undefined } } | undefined;
declare const process: { env: Record<string, string | undefined> } | undefined;

/** Read an environment variable on the edge, on Deno, or on Node. */
function env(key: string): string | undefined {
  if (typeof Deno !== "undefined") return Deno.env.get(key);
  if (typeof process !== "undefined") return process.env[key];
  return undefined;
}

setGetEnv((key) => env(key));

const options = __BUNNY_ADAPTER_OPTIONS__;
const build: BuildManifest =
  typeof __BUNNY_BUILD_MANIFEST__ !== "undefined"
    ? __BUNNY_BUILD_MANIFEST__
    : { assets: null, headers: null };

/**
 * The set of files the build produced. When it is present the script knows
 * whether Storage holds a path, so a miss costs no subrequest at all.
 */
const assets: ReadonlySet<string> | null = build.assets ? new Set(build.assets) : null;

const storage = createStorage({
  zone: options.storageZone || env("BUNNY_STORAGE_ZONE") || "",
  host: options.storageHost || env("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com",
  key: env("BUNNY_STORAGE_KEY") || "",
});

/** Extend the isolate's life. A no-op away from the bunny.net network. */
function waitUntil(promise: Promise<unknown>): void {
  if (typeof Bunny !== "undefined" && Bunny?.v1?.waitUntil) {
    Bunny.v1.waitUntil(promise);
    return;
  }
  // Nothing keeps the isolate alive here, but a rejection must not go unheard.
  void Promise.resolve(promise).catch(() => {});
}

/**
 * The visitor's IP.
 *
 * bunny.net puts it in `x-forwarded-for`. The left-most entry is the client;
 * anything after it was added by a proxy in front of us.
 *
 * The fallback matters. `Astro.clientAddress` throws when the adapter hands it
 * nothing, so a page would fail rather than show an unknown IP. On the
 * bunny.net network the header is always there; away from it the request
 * really does come from this machine.
 */
function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || "127.0.0.1";
}

/** Everything the edge knows about this request, for `Astro.locals.runtime`. */
function runtimeContext(request: Request): BunnyRuntime {
  return {
    country: request.headers.get("cdn-requestcountrycode") ?? undefined,
    requestId: request.headers.get("cdn-requestid") ?? undefined,
    clientAddress: clientAddress(request),
    waitUntil,
    caches: typeof caches !== "undefined" ? caches : undefined,
    env,
  };
}

const app = createApp();

/** Turn a Storage response into the response the visitor gets. */
function fromStorageResponse(object: string, upstream: Response, method: string): Response {
  const type = contentType(object);
  const headers = new Headers({
    "content-type": type,
    "cache-control": isHtml(type) ? options.pageCacheControl : options.assetCacheControl,
  });

  // Let the pull zone and the browser revalidate instead of re-downloading.
  for (const name of ["etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Headers Astro asked for on this prerendered page, such as a CSP.
  for (const [name, value] of build.headers?.[object] ?? []) {
    headers.set(name, value);
  }

  if (method === "HEAD") {
    void upstream.body?.cancel();
    return new Response(null, { status: 200, headers });
  }
  return new Response(upstream.body, { status: 200, headers });
}

/**
 * Read one object for this request path, or return `null`.
 *
 * With the build manifest this makes at most one subrequest, and none at all
 * for a path the build never produced. Without it, a path with no extension
 * costs two, because the page may be `<route>/index.html` or `<route>.html`.
 */
async function fromStorage(pathname: string, method = "GET"): Promise<Response | null> {
  if (!storage.enabled) return null;

  let candidates: string[];
  if (assets) {
    const object = resolveObject(pathname, assets);
    if (!object) return null;
    candidates = [object];
  } else {
    candidates = objectCandidates(pathname);
  }

  for (const object of candidates) {
    const upstream = await storage.get(object);
    if (upstream) return fromStorageResponse(object, upstream, method);
  }
  return null;
}

/**
 * Astro calls this to find a prerendered `404.html` or `500.html`. Without it
 * the visitor gets a bare status code, even though the page sits in Storage.
 */
async function prerenderedErrorPageFetch(url: string): Promise<Response> {
  const response = await fromStorage(new URL(url).pathname);
  if (!response) throw new Error(`No prerendered error page for ${url}`);
  return response;
}

/**
 * Say how a rendered response may be cached, unless it already says.
 *
 * A bunny.net pull zone applies its own expiration to a response that carries
 * no `Cache-Control`. Without this, a page rendered for one visitor could be
 * cached and handed to the next one. A route that sets its own header, and a
 * route matched by `routeRules`, both keep what they set.
 */
function withCacheControl(response: Response): Response {
  if (response.headers.has("cache-control")) return response;
  response.headers.set("cache-control", options.serverCacheControl);
  return response;
}

/** Handle one request. Exported so it can be tested or wrapped. */
export async function handle(request: Request): Promise<Response> {
  const render = {
    addCookieHeader: true,
    clientAddress: clientAddress(request),
    locals: { runtime: runtimeContext(request) },
    prerenderedErrorPageFetch,
    waitUntil,
  };

  // 1. Astro owns this route. Render it now.
  //
  // A page that answers 404 with no body reaches back through
  // `prerenderedErrorPageFetch` on its own, so the site's own 404 page comes
  // out of Storage without the adapter doing anything here.
  const routeData = app.match(request);
  if (routeData) return withCacheControl(await app.render(request, { ...render, routeData }));

  // 2. Not an Astro route. Look for an asset or a prerendered page.
  const stored = await fromStorage(new URL(request.url).pathname, request.method);
  if (stored) return stored;

  // 3. Nothing matched. Let Astro answer, which reaches back into Storage for
  //    a prerendered 404 when the project has one.
  return withCacheControl(await app.render(request, render));
}

export function start(): void {
  // On the bunny.net network the SDK ignores the listener and uses the
  // platform's own. Off it, this is what lets `astro preview` and the test
  // suite choose a free port instead of fighting over 8080.
  const port = Number(env("PORT") ?? env("BUNNY_PORT") ?? 8080);

  // The SDK wants a dotted IPv4, and it throws on anything else. A name such
  // as "localhost" is what a preview server usually passes, so map it back.
  const requested = env("BUNNY_HOSTNAME") ?? "127.0.0.1";
  const hostname = /^\d{1,3}(\.\d{1,3}){3}$/.test(requested) ? requested : "127.0.0.1";

  BunnySDK.net.http.serve({ hostname, port }, handle);
}

start();
