/**
 * Runtime entrypoint. This is what actually runs inside the Edge Script.
 *
 * Astro renders every route it owns. Everything else — hashed assets and
 * prerendered pages — is read from Bunny Storage, because the edge has no
 * build output on disk.
 */
import { createApp } from "astro/app/entrypoint";
import { setGetEnv } from "astro/env/setup";
import * as BunnySDK from "@bunny.net/edgescript-sdk";
import type { RuntimeOptions } from "./types.js";

// Replaced with a literal by the adapter at build time.
declare const __BUNNY_ADAPTER_OPTIONS__: RuntimeOptions;

declare const Deno: { env: { get(key: string): string | undefined } } | undefined;
declare const process: { env: Record<string, string | undefined> } | undefined;

/** Read an environment variable on Deno or on Node. */
function env(key: string): string | undefined {
  if (typeof Deno !== "undefined") return Deno.env.get(key);
  if (typeof process !== "undefined") return process.env[key];
  return undefined;
}

setGetEnv((key) => env(key));

const options = __BUNNY_ADAPTER_OPTIONS__;
const STORAGE_HOST = options.storageHost || env("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com";
const STORAGE_ZONE = options.storageZone || env("BUNNY_STORAGE_ZONE") || "";
const STORAGE_KEY = env("BUNNY_STORAGE_KEY") || "";

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  wasm: "application/wasm",
  pdf: "application/pdf",
  webmanifest: "application/manifest+json",
};

function contentType(objectPath: string): string {
  const ext = objectPath.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** Strip the leading slash and any traversal segment. */
function toObjectPath(pathname: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  return decoded
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part !== "" && part !== "." && part !== "..")
    .join("/");
}

const app = createApp();

/**
 * Read one object from the storage zone.
 * A path with no file extension may be a prerendered page, so both
 * `<route>/index.html` and `<route>.html` are tried.
 */
async function fromStorage(pathname: string): Promise<Response | null> {
  if (!STORAGE_ZONE) return null;

  const base = toObjectPath(pathname);
  const last = base.split("/").pop() ?? "";
  const candidates = last.includes(".")
    ? [base]
    : [base ? `${base}/index.html` : "index.html", ...(base ? [`${base}.html`] : [])];

  for (const object of candidates) {
    const upstream = await fetch(`https://${STORAGE_HOST}/${STORAGE_ZONE}/${object}`, {
      headers: STORAGE_KEY ? { AccessKey: STORAGE_KEY } : undefined,
    });
    if (!upstream.ok) continue;

    const type = contentType(object);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": type,
        "cache-control": type.startsWith("text/html")
          ? options.pageCacheControl
          : options.assetCacheControl,
      },
    });
  }
  return null;
}

/** Handle one request. Exported so it can be tested or wrapped. */
export async function handle(request: Request): Promise<Response> {
  const routeData = app.match(request);

  // 1. Astro owns this route. Render it now.
  if (routeData) {
    // addCookieHeader turns Astro.cookies.set() into a Set-Cookie header.
    return app.render(request, { routeData, addCookieHeader: true });
  }

  // 2. Not an Astro route. Look for an asset or a prerendered page.
  const stored = await fromStorage(new URL(request.url).pathname);
  if (stored) return stored;

  // 3. Nothing matched. Let Astro render its own 404.
  return app.render(request, { addCookieHeader: true });
}

export function start(): void {
  BunnySDK.net.http.serve(handle);
}

start();
