# @bunny.net/astro-adapter

## 0.1.0

The first release. It runs an Astro 7 project on bunny.net Edge Scripting.

### What it does

- **Renders on demand at the edge.** Astro's server answers each request inside
  the Edge Script, on a node near the visitor.
- **Serves the build from Bunny Storage.** Client assets and prerendered pages
  are read from a storage zone. The list of built files is inlined, so a request
  for a path the build never produced costs no storage request.
- **Deploys what the routes need.** The routes decide, not the `output` setting,
  because since Astro 5 that setting is only a default. A project that
  prerenders every route gets no script and no bundle. Pass `deploy: "server"`
  for a prerendered page that holds a `server:defer` island, which Astro reports
  as a static build.
- **Writes one manifest.** The build writes `.bunny/build.json`, and the bunny
  CLI reads it. `bunny lab deploy astro` creates the storage zone, the Edge
  Script, and the pull zone, uploads the build, sets every variable, and
  publishes. `bunny sites deploy` deploys a build that prerenders every route.
  No storage password passes through your terminal.
- **Previews the real bundle.** `astro preview` runs the bundle on Deno, behind a
  local storage zone. It needs no account and no network.

### Platform features

- `Astro.session` keeps each session as one object in a storage zone.
- `Astro.cache.invalidate()` purges by tag or by path, and `routeRules` become
  `Cache-Control` and `CDN-Tag` headers.
- `imageService: "bunny"` resizes and re-encodes with Bunny Optimizer, so a
  build needs no `sharp`. Optimizer cannot read from an Edge Script yet, and the
  build says so.
- `Astro.locals.runtime` carries the visitor's country, the request id, the
  client address, `waitUntil`, `caches`, and `env`.
- `Astro.clientAddress` reads `x-forwarded-for`.
- A prerendered `404.astro` or `500.astro` is served for the status it names.
- A configured redirect answers with its own status, and a site that sets `base`
  serves its assets.
- A stored object is served in pieces: `Range`, `If-Range`, `If-None-Match`, and
  `If-Modified-Since` all pass through to storage.
- `external`, `sourcemap`, and an `esbuild()` hook let you change the bundle.

### Limits this release holds you to

- A script has 10 MB. The build fails above it, and names the packages that
  filled the bundle. It warns above 7.5 MB, because 7.5 MB is the size that
  works: measured in August 2026, the same code served every request at 7.44 MB
  and answered 400 with an empty body at 7.83 MB.
- No secret enters the bundle or the config. A storage password and an API key
  are read from the script environment, at runtime.
- Every storage request stays inside the configured zone. Each path segment is
  encoded before the script asks storage, and a backslash separates a path in
  the same way a slash does.
- A server-rendered response that sets no `Cache-Control` gets
  `private, no-store`. A pull zone applies its own 30 day expiration to a
  response with no directive, so a page rendered for one visitor could otherwise
  be handed to the next one. Change it with `serverCacheControl`.
- Node 22.12 or later, which is what Astro 7 needs.

### Status

This is a lab project. The options, the build output, and the manifest can all
change in a minor release. Read the README before you depend on it.
