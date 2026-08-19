# @bunny.net/astro-adapter

Run [Astro](https://astro.build/) on [bunny.net Edge Scripting](https://bunny.net/docs/scripting).

Astro's server renders pages and runs API routes inside the Edge Script, per
request. The build's client assets and prerendered pages are read from
[Bunny Storage](https://bunny.net/docs/storage).

```
browser ──▶ pull zone ──▶ Edge Script (Astro SSR)
                              │
                              └─ assets and prerendered pages ─▶ Bunny Storage
```

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

## Build

```bash
astro build
```

The adapter bundles Astro's server output into a single `dist/index.js`, which
is what Edge Scripting accepts. Your static files stay in `dist/client`.

## Deploy

```bash
# 1. Client assets and prerendered pages go to the storage zone.
BUNNY_STORAGE_ZONE=my-site-assets \
BUNNY_STORAGE_KEY=<write password> \
npx bunny-astro upload

# 2. The server bundle goes to the Edge Script.
bunny scripts deploy dist/index.js
```

Run both on every deploy. Astro renames its CSS and JS bundles whenever they
change, so deploying only the script leaves the new names missing from storage
and the site loses its styles.

## Configure the script

The adapter reads its storage settings from the environment at runtime, so no
password is ever baked into the bundle.

| Variable | Purpose |
| --- | --- |
| `BUNNY_STORAGE_ZONE` | The zone holding `dist/client` |
| `BUNNY_STORAGE_HOST` | The zone's regional endpoint. Defaults to `storage.bunnycdn.com` |
| `BUNNY_STORAGE_KEY` | The zone's **read-only** password |

```bash
bunny scripts env set BUNNY_STORAGE_ZONE my-site-assets
bunny scripts env set BUNNY_STORAGE_HOST storage.bunnycdn.com
bunny scripts env set BUNNY_STORAGE_KEY <read-only password> --secret
```

The script only reads files, so give it the read-only password, never the one
that can write or delete.

## Options

```js
bunny({
  storageZone: "my-site-assets",   // default: BUNNY_STORAGE_ZONE at runtime
  storageHost: "ny.storage.bunnycdn.com", // default: BUNNY_STORAGE_HOST, then storage.bunnycdn.com
  outfile: "dist/index.js",        // where to write the deployable bundle
  bundle: true,                    // set false to run your own bundler
  imageService: "noop",            // set false to keep your own image service
  assetCacheControl: "public, max-age=31536000, immutable",
  pageCacheControl: "public, max-age=60",
});
```

Every option is optional. `storageZone` and `storageHost` are useful when you
would rather commit them than set them per environment; the password always
comes from the environment.

## What works

| Astro feature | Supported |
| --- | --- |
| Server-rendered pages | Yes |
| `src/pages/api/` endpoints | Yes |
| `src/middleware.ts` | Yes |
| `Astro.request`, `Astro.locals`, `Astro.url`, `Astro.params` | Yes |
| `Astro.cookies`, including `set()` | Yes, see the note below |
| Dynamic routes | Yes |
| `export const prerender = true` | Yes, served from Storage |
| `astro:env` secrets | Yes, from script environment variables |
| `sharp` image service | No. Native binaries cannot run on the edge |

### Cookies

A pull zone created for a script has **Disable cookies** switched on, which
strips `Set-Cookie` from every response. Turn it off before
`Astro.cookies.set()` will reach the browser:

```bash
bunny api POST /pullzone/<pull-zone-id> --body '{"DisableCookies": false}'
```

## Local development

`astro dev` works as usual for day-to-day work.

To exercise the real edge bundle, build it and run it with
[Deno](https://deno.com/):

```bash
astro build
BUNNY_STORAGE_ZONE=my-site-assets \
BUNNY_STORAGE_HOST=storage.bunnycdn.com \
BUNNY_STORAGE_KEY=<read-only password> \
deno run -A dist/index.js
```

It listens on `http://127.0.0.1:8080/` and reads assets from the real zone.
The `cdn-` request headers only exist on the bunny.net network, so anything
your code reads from them is absent locally.

## Limits

Edge Scripting allows one JavaScript file of up to 10 MB, and gives a script
500 ms to start. A small Astro site bundles to roughly 600 kB. See the
[Edge Scripting limits](https://bunny.net/docs/scripting/limits).

## Troubleshooting

**The bundle fails to resolve `fs` or `child_process`.** A dependency needs
Node-only modules. `sharp` is the usual cause, and the adapter already replaces
it. If something else does it, replace that dependency.

**Prerendered pages 404.** Upload `dist/client` again. The adapter looks for
both `<route>/index.html` and `<route>.html`.

**Assets 404 but pages render.** Upload from `dist/client`, not `dist`.

**A POST returns 403.** Astro checks the request origin for server output.
This is Astro's CSRF protection. Adjust `security.checkOrigin` if you need to.

**The build warns about `Astro.request.headers`.** Middleware also runs while
Astro prerenders a page, where there is no live request. Guard it with
`if (context.isPrerendered) return next();`.

## Documentation

[Deploy an Astro site on Edge Scripting](https://bunny.net/docs/scripting/frameworks/astro)

## Licence

[MIT](./LICENSE)
