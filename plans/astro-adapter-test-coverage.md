# Make the Astro adapter production ready

## Built, 2026-08-19

All of it, and it found a fifth defect and a platform limitation the plan did
not expect.

### What turned out differently

- **A fourth defect, found by the fixtures.** A prerendered 500 page left with
  `Cache-Control: public, max-age=60`, so a pull zone cached one transient
  failure and handed it to everybody. A 500 now leaves with no caching, and a
  404 keeps the page lifetime.
- **Bunny Optimizer cannot read from an Edge Script.** The live run was meant to
  prove Optimizer resizes an image. It proved the opposite: with Optimizer on,
  every image request that misses the CDN cache answers `523 Origin Connection
Failed`. Optimizer fetches the original from the pull zone's origin, and a
  script is not an origin it can read. Reproduced on pull zones 6370161 and
  6370019, with and without `OptimizerAutomaticOptimizationEnabled`.

  So `imageService: "bunny"` writes the right URLs and nothing serves them. The
  build now warns, and the README, the option docs, and the guide all say so.
  The default was already `"noop"`, so no project is affected unless it opted
  in. This needs a fix on the Optimizer side, not in the adapter.

- **The islands fixture uses Svelte, not the framework we reached for first.**
  `@astrojs/preact@6.0.3` cannot prerender under `astro@7.2.3`: the prerender
  entry keeps a bare `astro:preact:opts` import that Node's loader refuses. It
  fails with no adapter at all, so it is upstream. Svelte works.
- **Two checks record what Astro decides, not what we assumed.** Astro hands
  back the 500 page for an endpoint that throws, and it answers 404 at the root
  of a site with `prefixDefaultLocale`. `astro dev` does both the same way, so
  neither is ours.
- **`output: "static"` still builds a server.** The plan expected the adapter's
  warning to matter. Astro 7 builds a server entry whenever an adapter is set,
  so a static site gets a working script that reads every page out of Storage.
  The fixture proves that, and the warning is now the misleading part.
- **Thirteen fixtures, not twelve.** `runtime` was split out to hold the checks
  that belong to no single feature.

### What was verified

- `npm run test` — 84 unit tests pass.
- `node --test tests/suites/*.test.mjs` — 105 fixture tests pass, in 7.6 s.
- `node tests/e2e.mjs` — the showcase still passes, all 23 checks.
- `npm run format:check` and `npm run check` are clean.
- `node tests/live.mjs --optimizer` against `astro-ssr-demo.bunny.run`: all 23
  showcase checks pass, all 7 Optimizer-off checks pass, and 4 of 7
  Optimizer-on checks fail with the 523 above. The pull zone ended in the state
  it started in, both times it ran.

### What is still open

- The Optimizer limitation. The live test is the reproduction, and it turns
  green on its own when the platform can serve an image from a script.
- A `Range` request on a stored object still returns the whole object.
- `Astro.rewrite()` to a prerendered route still throws, which is Astro's own
  limitation and already in the guide.

## Why

The adapter has one end-to-end fixture, the showcase. That fixture uses one
configuration. So the tests prove one shape of project, and they prove it well.

A real project changes the configuration. It sets `base`. It adds `redirects`.
It uses `build.format: "file"`. The tests say nothing about any of those.

The Netlify and Cloudflare adapters solve this with many small fixtures. Each
fixture is a complete Astro project with one configuration. Each test builds its
fixture and asserts one behaviour.

We follow the same pattern. Three probe builds already found three defects that
the current suite cannot see, and all three break a normal project.

## The defects the probes found

### 1. `base` is ignored, so a site under a path is unusable

Astro writes the client build without the `base` prefix. The browser asks with
the prefix. The script does not remove it, so every lookup misses.

Measured with `base: "/docs"`:

| Request                    | Now | Correct |
| -------------------------- | --- | ------- |
| `/docs/about`              | 404 | 200     |
| `/docs/_astro/about.*.css` | 404 | 200     |
| `/about`                   | 200 | 404     |

The page renders, and it has no styles and no links that work.

### 2. A configured redirect answers 200

Astro prerenders an internal redirect as an HTML page. It also asks the adapter
to add a `Location` header to that page. The script serves the page with a
hard-coded status 200.

So `redirects: { "/old": "/new" }` sends `200 OK` with `Location: /new`. A
browser ignores `Location` on a 200, and the visitor sees an empty page.

### 3. An external redirect returns 500

Astro builds an external redirect with `Response.redirect()`. That gives a
response whose headers are immutable. `withCacheControl` writes to them, and
the write throws.

So `redirects: { "/away": "https://example.com/" }` returns 500. Any route that
returns `Response.redirect()` fails the same way.

## What this plan builds

### A. A fixture harness

`tests/fixtures.mjs` gets one function, `buildFixture`. It builds a fixture with
`astro build`, starts a local storage zone over `dist/client`, and runs the
bundle on Deno. It returns `get()`, the build directory, and `close()`.

A second function, `buildOnly`, builds without serving. A test that only reads
the build output uses it, and it costs no Deno process.

`tests/fixtures.test.mjs` holds the suites, one per fixture, under `node:test`.
The fixtures live in `tests/fixtures/<name>/`.

Each fixture depends on the workspace package, so no fixture needs an install
of its own.

### B. The fixtures

| Fixture         | What it proves                                              |
| --------------- | ----------------------------------------------------------- |
| `base-path`     | `base: "/docs"` serves assets, pages, and the 404 page      |
| `build-format`  | `build.format: "file"` writes `about.html`, and it is found |
| `redirects`     | Internal, external, dynamic, and `Astro.redirect` redirects |
| `static-output` | `output: "static"` still builds and serves a whole site     |
| `csp`           | `security.csp` headers reach a page read from Storage       |
| `islands`       | A client island hydrates, and a server island renders       |
| `actions`       | An Astro action answers a POST                              |
| `i18n`          | Locale routing, and prerendered locale pages                |
| `no-manifest`   | `assetManifest: false` finds the same files by probing      |
| `options-off`   | `sessions`, `cache`, and `imageService` all off             |
| `content`       | A content collection renders, prerendered and on demand     |
| `errors`        | A page that throws gets the prerendered 500 page            |

### C. What each fixture asserts

Taken from the Netlify and Cloudflare suites, and from what our runtime does.

- **Cookies.** Two `Set-Cookie` headers arrive as two headers, not one.
- **Streams.** A `ReadableStream` body arrives whole.
- **Bodies.** A POST of 100 kB arrives whole, and its type survives.
- **`astro:env`.** `getSecret` reads a script environment variable.
- **Method.** `HEAD` on a stored object and on a rendered route sends no body.
- **Traversal.** A path that climbs out of the zone gets a 404.
- **Cache-Control.** A rendered response is never left cacheable by accident.

### D. The Optimizer end-to-end run

`tests/live.mjs` replaces the verify half of `scripts/deploy-demo.mjs`. It runs
the showcase checks against the deployed site, and then it runs the Optimizer
checks twice: once with Optimizer off, and once with it on.

It turns Optimizer on and off with the pull zone API:

```
bunny api POST /pullzone/<id> --body '{"OptimizerEnabled":true}'
```

Optimizer is a paid feature. So the run reads the zone's state first, and it
restores that state at the end, even after a failure.

With Optimizer off, an image URL that carries `?width=360` returns the original
image at its original size. With Optimizer on, the same URL returns an image
360 pixels wide.

The test reads the width out of the image itself. A small reader in
`tests/image-size.mjs` handles PNG, JPEG, and WebP, so the check needs no
dependency.

### E. The fixes

1. Add `base` to the runtime options. The script removes the prefix before it
   looks in Storage. A request outside the prefix finds no object. The build
   removes the prefix from the static-header keys too.
2. Rebuild the response in `withCacheControl` when its headers are immutable.
3. Record every prerendered redirect in the build manifest, with its status and
   its destination. The script answers a redirect before it reads Storage.

Astro decides the status the same way we must: the configured status when the
route carries one, and otherwise 301 for `GET` and 308 for anything else.

### F. Continuous integration

The `e2e` job gains a step for `tests/fixtures.test.mjs`. The job already has
Deno and it already builds the workspace, so it needs nothing else.

## What this plan does not do

- The live run stays manual. Continuous integration holds no credential.
- `Astro.rewrite()` to a prerendered route still throws. That is Astro's own
  limitation, and the guide already records it.
- A `Range` request on a stored object still returns the whole object. Bunny
  Storage answers ranges, so this is worth doing later, and it is not a defect
  a normal page meets.
- Only one framework fixture. Cloudflare tests four. One proves the adapter
  serves the client bundle, which is the part we own.

## How we know it works

- `npm run test` passes, with the new unit tests for the three fixes.
- `node tests/fixtures.test.mjs` passes on Deno.
- `node tests/e2e.mjs` still passes.
- `node tests/live.mjs` passes against `astro-ssr-demo.bunny.run`, with
  Optimizer off and then on, and the pull zone ends in the state it started in.
