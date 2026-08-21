---
"@bunny.net/astro-adapter": minor
---

Fix four defects, and add the platform features Astro has hooks for.

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
- **One-command deploys.** The build writes `.bunny/build.json`, and
  `bunny sites deploy` reads it: it creates the storage zone, the script, and the pull
  zone, uploads the build, sets every variable, and publishes. No password
  passes through your terminal.
- **Build escape hatches.** `external`, `sourcemap`, and an `esbuild()` hook.

Also: the README no longer says `node:fs` is unavailable. Edge Scripting
provides most `node:` built-ins, and the adapter already rewrites a bare `fs` to
`node:fs` so a dependency resolves. Only a native binary is a real problem.

Also: a server-rendered response that sets no `Cache-Control` now gets
`private, no-store`. A bunny.net pull zone applies its own 30 day expiration to
a response with no directive, so without this a page rendered for one visitor
could be cached and handed to the next one. Change it with `serverCacheControl`.
