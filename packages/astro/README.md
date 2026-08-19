# @bunny.net/astro-adapter

Run [Astro](https://astro.build/) on
[bunny.net Edge Scripting](https://bunny.net/docs/scripting).

Astro's server renders pages and runs API routes inside the Edge Script, per
request, on a node near your visitor. The build's client assets and prerendered
pages are read from [Bunny Storage](https://bunny.net/docs/storage).

```
browser ──▶ pull zone ──▶ Edge Script (Astro SSR)
                              │
                              └─ assets and prerendered pages ─▶ Bunny Storage
```

**[See it running](https://astro-ssr-demo.bunny.run)** ·
[source of that site](https://github.com/BunnyWay/bunny-adapters/tree/main/examples/astro-showcase)
· [guide](https://bunny.net/docs/scripting/frameworks/astro)

## Install

```bash
npx astro add @bunny.net/astro-adapter
```

Or set it up yourself:

```bash
npm install @bunny.net/astro-adapter
```

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: bunny(),
});
```

## Deploy

```bash
npm run build
npx bunny-astro deploy
```

`deploy` uploads `dist/client` and then deploys `dist/index.js`, in that order.
Both have to happen every time: Astro renames its CSS and JS bundles whenever
they change, so deploying only the script leaves the new names missing from
storage and the site loses its styles.

<details>
<summary>The two steps by hand</summary>

```bash
BUNNY_STORAGE_ZONE=my-site-assets \
BUNNY_STORAGE_KEY=<write password> \
npx bunny-astro upload

bunny scripts deploy dist/index.js
```

</details>

## Configure the script

The adapter reads its settings from the script environment, so no password is
ever baked into the bundle.

| Variable             | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `BUNNY_STORAGE_ZONE` | The zone holding `dist/client`                                   |
| `BUNNY_STORAGE_HOST` | The zone's regional endpoint. Defaults to `storage.bunnycdn.com` |
| `BUNNY_STORAGE_KEY`  | The zone's **read-only** password                                |
| `BUNNY_SESSION_ZONE` | Only for sessions. A zone the script may write to                |
| `BUNNY_SESSION_KEY`  | Only for sessions. That zone's **write** password                |
| `BUNNY_API_KEY`      | Only for cache purging                                           |
| `BUNNY_PULLZONE_ID`  | Only for cache purging                                           |

```bash
bunny scripts env set BUNNY_STORAGE_ZONE my-site-assets
bunny scripts env set BUNNY_STORAGE_HOST storage.bunnycdn.com
bunny scripts env set BUNNY_STORAGE_KEY <read-only password> --secret
```

The script only reads the asset zone, so give it the read-only password, never
the one that can write or delete.

## Local development

`astro dev` works as usual for day-to-day work.

`astro preview` runs the file you are about to deploy. A local storage zone
stands in for Bunny Storage, so assets, prerendered pages and sessions all work
with no account and no network:

```bash
npm run build
npx astro preview
```

It needs [Deno](https://deno.com/) 2, because Deno is the Edge Scripting
runtime. The `cdn-` request headers only exist on the bunny.net network, so
anything your code reads from them is absent locally.

## What works

| Astro feature                                                | Supported                                                |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| Server-rendered pages                                        | Yes                                                      |
| `src/pages/api/` endpoints                                   | Yes                                                      |
| `src/middleware.ts`                                          | Yes                                                      |
| Dynamic routes and server islands                            | Yes                                                      |
| `Astro.request`, `Astro.locals`, `Astro.url`, `Astro.params` | Yes                                                      |
| `Astro.clientAddress`                                        | Yes, from `x-forwarded-for`                              |
| `Astro.cookies`, including `set()`                           | Yes, [see the note](#cookies)                            |
| `Astro.session`                                              | Yes, stored in a storage zone                            |
| `export const prerender = true`                              | Yes, served from Storage                                 |
| Prerendered `404.astro` and `500.astro`                      | Yes, served from Storage                                 |
| `routeRules` and cache purging                               | Yes. [Turn Smart Cache off](#turn-smart-cache-off-first) |
| Image transformation                                         | Yes, with Bunny Optimizer                                |
| `astro:env` secrets                                          | Yes, from script environment variables                   |
| `astro preview`                                              | Yes, with Deno                                           |
| Static page headers, such as a CSP                           | Yes, applied by the script                               |
| `sharp` image service                                        | No. Native binaries cannot run on the edge               |
| Edge middleware as a separate function                       | No. Middleware runs inside the script                    |
| i18n domains                                                 | Untested. Tell us if you need it                         |

## Images

Set `imageService: "bunny"` to resize and re-encode with
[Bunny Optimizer](https://bunny.net/docs/optimizer), at the edge, with no build
step and no `sharp`:

```js
bunny({
  imageService: "bunny",
  image: {
    widths: [360, 720, 1080], // used to build a srcset
    quality: 82,
    maxWidth: 3840, // a crafted URL cannot ask for more
  },
});
```

```astro
---
import { Image } from "astro:assets";
import hero from "../assets/hero.png";
---

<Image src={hero} widths={[360, 720, 1080]} alt="" />
```

Turn Optimizer on for the pull zone first. It is a paid feature, so the adapter
never enables it for you, and the default stays `"noop"`. Without Optimizer the
parameters are ignored and the original image is served.

Optimizer only works on files your own pull zone serves, so an image on another
host passes through untouched.

## Sessions

`Astro.session` works out of the box. Each session is one object in a Bunny
Storage zone, so every edge node reads the same value.

Give the script a zone it may write to, and keep the asset zone read-only:

```bash
bunny api POST /storagezone --body '{"Name":"my-site-sessions","Region":"DE"}'
bunny scripts env set BUNNY_SESSION_ZONE my-site-sessions
bunny scripts env set BUNNY_SESSION_KEY <write password> --secret
```

Bunny Storage does not expire an object, so `session.ttl` controls the cookie
and not the stored object. Delete old objects yourself if the zone grows.

Pass `sessions: false` to configure your own driver instead.

## Caching and purging

Astro's `routeRules` become the headers the bunny.net CDN reads:

```js
export default defineConfig({
  adapter: bunny(),
  routeRules: {
    "/products/[...slug]": { maxAge: 3600, swr: 600, tags: ["products"] },
  },
});
```

```
Cache-Control: public, max-age=0, must-revalidate, s-maxage=3600, stale-while-revalidate=600
CDN-Tag: products,astro-path:/products/socks
```

`s-maxage` is for the CDN and `max-age` is for the browser. Splitting them is
what makes a purge take effect straight away. Set
`cache: { browserMaxAge: 30 }` if you would rather the browser cached too.

Purge by tag, or by path:

```ts
await Astro.cache.invalidate({ tags: ["products"] });
await Astro.cache.invalidate({ path: "/products/socks" });
```

That calls the [purge API](https://bunny.net/docs/cdn/purge-cache), so the
script needs `BUNNY_API_KEY` and `BUNNY_PULLZONE_ID`. Pass `cache: false` to
configure your own provider.

### Turn Smart Cache off first

[Smart Cache](https://bunny.net/docs/cdn/smart-cache) only caches known static
file extensions, and HTML is not one of them. It is on by default, and while it
is on a `routeRules` entry has no effect: the page is rendered again for every
request.

```bash
bunny api POST /pullzone/<pull-zone-id> --body '{"EnableSmartCache": false}'
```

Smart Cache exists to stop a misconfigured origin caching a personal page by
accident, so read the next section before you switch it off.

### Why a dynamic page says no-store

A bunny.net pull zone applies its own expiration, by default 30 days, to any
response that carries no `Cache-Control`. With Smart Cache off, that would
cache a page rendered for one visitor and hand it to the next one.

So the adapter sets `Cache-Control: private, no-store` on every server-rendered
response that does not set one itself. A route with a `routeRules` entry, and a
route that sets its own header, both keep what they set. Change the default
with `serverCacheControl` if you know better for your site.

## The edge context

Every page gets `Astro.locals.runtime`:

```ts
const { country, requestId, clientAddress, waitUntil, caches, env } = Astro.locals.runtime;

// Keep working after the response has gone out.
waitUntil(recordVisit(country));
```

Add the types to your project:

```ts
// src/env.d.ts
type BunnyRuntime = import("@bunny.net/astro-adapter").BunnyRuntime;

declare namespace App {
  interface Locals {
    runtime: BunnyRuntime;
  }
}
```

## Cookies

A pull zone created for a script has **Disable cookies** switched on, which
strips `Set-Cookie` from every response. Turn it off before
`Astro.cookies.set()` will reach the browser:

```bash
bunny api POST /pullzone/<pull-zone-id> --body '{"DisableCookies": false}'
```

`bunny scripts show <script-id>` prints the linked pull zone and its id.

## Options

Every option is optional. `bunny()` on its own is usually right.

```js
bunny({
  // Storage
  storageZone: "my-site-assets", // otherwise BUNNY_STORAGE_ZONE at runtime
  storageHost: "ny.storage.bunnycdn.com", // otherwise BUNNY_STORAGE_HOST
  assetCacheControl: "public, max-age=31536000, immutable",
  pageCacheControl: "public, max-age=60",
  serverCacheControl: "private, no-store", // for a page that sets none itself

  // Features
  imageService: "noop", // "bunny" for Optimizer, false to keep your own
  image: {}, // settings for the Optimizer service
  sessions: true, // false to configure your own driver
  cache: true, // false to configure your own provider

  // Build
  outfile: "dist/index.js",
  bundle: true, // false to run your own bundler
  assetManifest: true, // or a file count, above which the script probes instead
  external: [], // modules esbuild must not bundle
  sourcemap: false,
  esbuild: (options) => options, // last resort
});
```

The storage password is never an option. It always comes from the environment,
so it stays out of the bundle.

### assetManifest

The adapter inlines the list of built client files into the script. A request
for something the build never produced then costs no lookup at all, and a
prerendered page costs one instead of two. A script may only make 50
subrequests, so this matters on a busy page.

Above 20 000 files the list would cost more space than it saves, and the script
goes back to asking Storage. Pass a number to move that line, or `false` to
switch it off.

## The command line

```
bunny-astro deploy    Upload the client build, then deploy the script
bunny-astro upload    Upload the client build only

  --dir <path>       Folder to upload            (default: dist/client)
  --zone <name>      Storage zone name           (env: BUNNY_STORAGE_ZONE)
  --host <hostname>  Storage endpoint            (env: BUNNY_STORAGE_HOST)
  --key <password>   Storage write password      (env: BUNNY_STORAGE_KEY)
  --script <id>      Edge Script to deploy to    (default: the linked one)
  --delete-stale     Remove objects the build no longer produces
  --dry-run          List what would happen, and change nothing
```

`--delete-stale` is worth running now and then. Astro hashes its asset names, so
every build leaves the previous ones in the zone.

## Limits

Edge Scripting allows one JavaScript file of up to 10 MB, and gives a script
500 ms to start. The showcase in this repository bundles to roughly 660 kB. See
the [Edge Scripting limits](https://bunny.net/docs/scripting/limits).

## Troubleshooting

**The bundle fails to resolve `fs` or `child_process`.** A dependency needs
Node-only modules. `sharp` is the usual cause, and the adapter already replaces
it. If something else does it, replace that dependency.

**Prerendered pages 404.** Upload `dist/client` again. Run
`bunny-astro deploy`, which never leaves the two halves out of step.

**Assets 404 but pages render.** Upload from `dist/client`, not `dist`.

**A POST returns 403.** Astro checks the request origin for server output. This
is Astro's CSRF protection. Adjust `security.checkOrigin` if you need to.

**`Astro.cookies.set()` has no effect.** The pull zone is stripping the header.
See [Cookies](#cookies).

**The build warns about `Astro.request.headers`.** Middleware also runs while
Astro prerenders a page, where there is no live request. Guard it with
`if (context.isPrerendered) return next();`.

**A `routeRules` entry changes nothing.** Smart Cache is on, and it does not
cache HTML. See [above](#turn-smart-cache-off-first).

**A page shows another visitor's content.** Something removed the
`Cache-Control` the adapter sets. Check that no edge rule overrides it, and
that the page is not setting a `public` directive itself.

**Every request returns a storage error.** Check that `BUNNY_STORAGE_ZONE`
matches the zone name, that `BUNNY_STORAGE_KEY` is a password of that zone, and
that `BUNNY_STORAGE_HOST` matches its region. A zone created seconds ago can
answer `401` until it propagates.

## Licence

[MIT](./LICENSE)
