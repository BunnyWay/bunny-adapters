# @bunny.net/astro-adapter

## 0.2.0

### Minor Changes

- [#2](https://github.com/BunnyWay/bunny-adapters/pull/2) [`41e8641`](https://github.com/BunnyWay/bunny-adapters/commit/41e86413924e913c00f33e58ff62eb6737378841) Thanks [@bogdan-at-bunny](https://github.com/bogdan-at-bunny)! - Fix four defects, and add the platform features Astro has hooks for.

  Fixed:

  - `Astro.clientAddress` was always empty. It now reads `x-forwarded-for`.
  - A prerendered `404.astro` or `500.astro` in Storage was never served. The
    visitor got a bare status code instead of the page.
  - Astro's `waitUntil` hook was not connected, so background work could not
    outlive a response.
  - A request for a path the build never produced cost two Storage subrequests.
    The adapter now inlines the list of built files, so a miss costs none.

  Added:

  - **Bunny Optimizer image service.** `imageService: "bunny"` resizes and
    re-encodes at the edge, with no build step and no `sharp`.
  - **Sessions.** `Astro.session` stores each session as one object in a Bunny
    Storage zone. Configured by default.
  - **Cache provider.** `routeRules` become `Cache-Control` and `CDN-Tag`
    headers, and `Astro.cache.invalidate()` purges by tag or by path.
  - **`astro preview`.** It runs the real bundle on Deno, with a local storage
    zone standing in for Bunny Storage. No account, no network.
  - **`Astro.locals.runtime`.** The visitor's country, the request id, the client
    address, `waitUntil`, `caches`, and `env`.
  - **Static page headers.** Headers Astro emits for a prerendered page, such as
    a content security policy, are applied when the script serves it.
  - **`bunny-astro deploy`.** One command uploads the client build and then
    deploys the script, so the two halves never fall out of step. `upload` gains
    `--delete-stale`.
  - **Build escape hatches.** `external`, `sourcemap`, and an `esbuild()` hook.

  Also: the README no longer says `node:fs` is unavailable. Edge Scripting
  provides most `node:` built-ins, and the adapter already rewrites a bare `fs` to
  `node:fs` so a dependency resolves. Only a native binary is a real problem.

  Also: a server-rendered response that sets no `Cache-Control` now gets
  `private, no-store`. A bunny.net pull zone applies its own 30 day expiration to
  a response with no directive, so without this a page rendered for one visitor
  could be cached and handed to the next one. Change it with `serverCacheControl`.

### Patch Changes

- [#4](https://github.com/BunnyWay/bunny-adapters/pull/4) [`0ec7c3b`](https://github.com/BunnyWay/bunny-adapters/commit/0ec7c3b10fc858311c8fc43957e4a73a1278de1f) Thanks [@bogdan-at-bunny](https://github.com/bogdan-at-bunny)! - Stop a pull zone caching a 500. Astro reuses the headers of the prerendered
  error page on the response the visitor gets, so a transient failure was cached
  and handed to everybody who asked for that path. A 404 keeps the page lifetime,
  because a missing path stays missing until the next deploy.

  Say plainly that Bunny Optimizer cannot read from an Edge Script yet. With
  Optimizer on, an image request that misses the CDN cache answers `523 Origin
Connection Failed`. `imageService: "bunny"` writes the right URLs, and nothing
  serves them, so the build now warns and the README says so.

  Serve a stored object in pieces. The script now passes `Range`, `If-Range`,
  `If-None-Match`, and `If-Modified-Since` through to Bunny Storage, which answers
  all four, and it says `Accept-Ranges: bytes` on every object it serves.

  That header is what a pull zone needs. Without it the pull zone answers a range
  request with the whole object, from its cache as well as from the origin, so a
  large file is only seekable once it is fully downloaded. A conditional request
  now costs a `304` instead of the whole object.

- [#4](https://github.com/BunnyWay/bunny-adapters/pull/4) [`bcbce62`](https://github.com/BunnyWay/bunny-adapters/commit/bcbce6236b9e6a0175906721941a57c69c682f66) Thanks [@bogdan-at-bunny](https://github.com/bogdan-at-bunny)! - Serve a site that sets `base`. Astro writes the client build without the `base`
  prefix, and the browser asks with it. The script now removes the prefix before
  it reads Bunny Storage, so assets and prerendered pages under a base path no
  longer answer 404.

  Answer a configured redirect with its own status. Astro turns an internal
  redirect to a prerendered page into a page that carries a `Location` header,
  and the script served that page as 200. A browser ignores `Location` on a 200,
  so `redirects: { "/old": "/new" }` sent the visitor nowhere.

  Stop an external redirect returning 500. Astro builds one with
  `Response.redirect()`, whose headers are immutable, and the adapter wrote a
  `Cache-Control` header into them.
