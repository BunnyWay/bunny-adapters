# bunny-adapters: monorepo, demo, tests, and Astro adapter v0.2

> **Built, 19 August 2026.** The repository is `BunnyWay/bunny-adapters`. The
> showcase is deployed at <https://astro-ssr-demo.bunny.run>, and every check
> passes there. What follows is what the plan got wrong, and what the live run
> taught us.
>
> ## What changed against the design
>
> **`imageService: "compile"` was dropped.** The plan listed four modes. On an
> edge runtime `sharp` cannot run at request time, so `"compile"` would work for
> a prerendered page and fail for an on-demand one. Shipping a mode that breaks
> half the time is worse than not having it. The modes are `"noop"` (default),
> `"bunny"` and `false`.
>
> **`astro preview` needs Deno. There is no Node fallback.** The plan said
> preview would rebuild against the SDK's Node build when Deno was absent. It
> was built, and it half worked: pages rendered but every server endpoint
> answered 500, because the Node-conditioned bundle resolves a different
> `Response`. A preview where API routes fail is a trap, so it was removed. The
> error message now names the one command that fixes it.
>
> **The storage emulator ships in the package.** The plan put it in `tests/`.
> It ended up at `packages/astro/src/build/local-zone.ts`, exported as
> `@bunny.net/astro-adapter/local-zone`, because `astro preview` needs the same
> thing users do. The test runner imports it from the built package. One
> implementation, two callers.
>
> **`i18nDomains` is not declared.** The plan considered it. It is untested, so
> claiming it would be a lie. The README says so.
>
> ## What the live run found
>
> Two things that no offline test could have shown.
>
> **Smart Cache silently disables `routeRules`.** It is on by default and only
> caches known static file extensions. HTML is not one, so a cache rule changed
> nothing: `cdn-cache` was `MISS` on every request and the page was rendered
> again each time. With `EnableSmartCache: false` the same page went
> `MISS`, `HIT`, `HIT`, and held its timestamp.
>
> **Turning Smart Cache off was unsafe, and that is now fixed.** A pull zone
> applies its own expiration, thirty days by default, to a response carrying no
> `Cache-Control`. Astro sets none on an ordinary page. The demo's `/session`
> page was cached and served to the next visitor. The adapter now sets
> `private, no-store` on any rendered response that does not set one itself,
> under the new `serverCacheControl` option. The two facts are documented next
> to each other, because the first one is unsafe without the second.
>
> **`runtime.server` was removed.** It read `cdn-pullzone`, which the CDN adds
> to the response and not to the request, so it was always undefined. The
> showcase now lists every `cdn-` header the script actually receives, which is
> more useful and cannot go stale.
>
> **Two checks had to become mode-aware.** The edge writes
> `cdn-requestcountrycode` and `cdn-requestid` itself, so a live run cannot
> inject them. Those checks assert the shape of the value live, and the exact
> value offline.
>
> ## What was verified
>
> - 69 unit tests, and 24 end-to-end checks offline against the bundle on Deno
>   behind the local storage zone.
> - 18 checks against the real deployment, including sessions in a real storage
>   zone, cookies through a real pull zone, the prerendered 404 out of Storage,
>   and `routeRules` producing a real `HIT`.
> - `astro preview` with Deno, and the error message without it.
> - `publint` and `attw --profile esm-only` clean on the built package.
> - The bundle is 657 kB, against the 10 MB limit.
>
> ## Left for later
>
> - Publishing to npm. The package has never been released, so
>   `npx astro add @bunny.net/astro-adapter` does not work yet. A changeset is
>   ready and the release workflow needs an `NPM_TOKEN` secret.
> - Bunny Optimizer is off on the demo pull zone. It is a paid feature, so the
>   gallery page serves original images until somebody turns it on.
> - Edge middleware on Bunny's middleware script type. Still out of scope.

## Context

`BunnyWay/bunny-astro-adapter` holds one adapter in a single-package repo. We
cannot maintain a separate repository for every framework. Svelte, OpenNext and
others come later, so the Astro adapter must move into a monorepo now.

Three more problems exist today:

1. **The adapter has real defects.** `Astro.clientAddress` is always empty. A
   prerendered `404.html` in Storage is never served. Astro's `waitUntil` hook is
   not connected. Every miss costs two wasted Storage subrequests.
2. **The adapter has no platform integration.** Astro 7 gives adapters first-class
   hooks for an image service, a session driver, a CDN cache provider and
   `astro preview`. The Cloudflare and Netlify adapters use all of them. Ours uses
   none, although bunny.net has the matching product for each one.
3. **Nothing proves the adapter works.** One smoke test builds a three-page
   fixture. There is no public demo to link from the documentation.

The outcome is one repository that looks maintained, one demo that is also the
test suite, and an Astro adapter that matches its competitors.

## Decisions taken

| Decision        | Choice                                              |
| --------------- | --------------------------------------------------- |
| Repository name | `BunnyWay/bunny-adapters` (GitHub keeps a redirect) |
| Package manager | npm workspaces (already in use, no new tool)        |
| Scope           | Correctness fixes plus the platform features        |
| CI              | Local end-to-end only. No credentials, no cost      |
| Demo            | One showcase site that is also the test fixture     |

Edge middleware stays out of scope. It needs a second deploy target.

## Repository layout

```
bunny-adapters/
├─ .github/
│  ├─ workflows/ci.yml            unit, types, package checks, end-to-end
│  ├─ workflows/release.yml       changesets → npm publish
│  ├─ ISSUE_TEMPLATE/{bug,feature,config}
│  └─ PULL_REQUEST_TEMPLATE.md
├─ packages/
│  └─ astro/                      @bunny.net/astro-adapter
│     ├─ src/{index,server,types}.ts
│     ├─ src/{image-service,session,cache,preview,manifest}.ts
│     ├─ src/bin/cli.ts
│     ├─ test/*.test.ts           unit tests, node:test
│     └─ {README,CHANGELOG,LICENSE}.md package.json tsconfig.json
├─ examples/
│  └─ astro-showcase/             the demo and the fixture
│     └─ e2e/checks.mjs           one assertion per demo page
├─ tests/
│  ├─ storage-emulator.mjs        serves dist/client as a Storage zone
│  └─ e2e.mjs                     build → emulator → Deno → run checks
├─ docs/writing-an-adapter.md     the contract every future adapter follows
├─ scripts/deploy-demo.mjs        manual deploy of the showcase
├─ plans/                         design docs, per the plan lifecycle
└─ CLAUDE.md README.md LICENSE CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md
```

MIT is correct. It is what Astro, the Astro adapters, and
`@bunny.net/edgescript-sdk` all use. Every package keeps its own `LICENSE` copy.

## Phase 1 — Monorepo and hygiene

- `gh repo rename bunny-adapters --repo BunnyWay/bunny-adapters`, then update the
  remote and every `repository` URL.
- Move the adapter to `packages/astro/`. Add a root `package.json` with
  `workspaces: ["packages/*", "examples/*"]`.
- Root scripts: `build`, `check`, `test`, `test:e2e`, `format`, `lint:package`.
- Add Prettier, plus `publint` and `arethetypeswrong` on the built package. Those
  two catch broken `exports` maps, which is the usual npm packaging defect.
- Add `@changesets/cli`. A merged changeset publishes to npm with provenance.
- Write `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue
  and pull-request templates, and a root `README.md` with an adapter status table.
- Write `docs/writing-an-adapter.md`. It records the layout, the naming rule
  (`@bunny.net/<framework>-adapter`), the test tiers, and the release steps. This
  is what makes the second adapter cheap.

## Phase 2 — Demo and test harness

The showcase is the fixture. Each page proves one capability, and each page has
one assertion in `examples/astro-showcase/e2e/checks.mjs`.

| Route          | Proves                                         |
| -------------- | ---------------------------------------------- |
| `/`            | Server rendering, per-request output           |
| `/api/hello`   | A server endpoint                              |
| `/blog/[slug]` | A dynamic route                                |
| `/about`       | `prerender = true`, read from Storage          |
| `/edge`        | `Astro.locals.runtime`, `Astro.clientAddress`  |
| `/counter`     | `Astro.cookies.get` and `set`                  |
| `/session`     | The Bunny Storage session driver               |
| `/gallery`     | The Bunny Optimizer image service and `srcset` |
| `/cached`      | `routeRules`, `Cache-Control`, `CDN-Tag`       |
| `404.astro`    | The prerendered error page, read from Storage  |

`src/middleware.ts` puts the visitor country into `Astro.locals`.

**`tests/storage-emulator.mjs`** is the key piece. It is a small HTTP server that
speaks the Bunny Storage protocol over `dist/client`: `GET /{zone}/{path}`, an
`AccessKey` header, `404` on a miss. With it the whole suite runs offline, and it
covers assets, prerendered pages and the 404 path, which the present smoke test
cannot. It needs one adapter change: accept a `storageHost` that carries a scheme,
so `http://127.0.0.1:8787` works next to `storage.bunnycdn.com`.

Three tiers:

1. `npm test` — unit tests on the pure helpers. No network, no build.
2. `npm run test:e2e` — build the showcase, start the emulator, run the bundle on
   Deno, run every check. This is what CI runs.
3. `node scripts/deploy-demo.mjs` — manual. Deploys the showcase and runs the same
   checks against the live URL. No credential ever enters CI.

## Phase 3 — Correctness

All in `packages/astro/src/server.ts`, which uses `RenderOptions` from
`astro/dist/core/app/base.d.ts`.

- **`clientAddress`.** Pass `x-forwarded-for` into `app.render`. `Astro.clientAddress`
  is empty today.
- **`prerenderedErrorPageFetch`.** Point it at Storage, so a prerendered `404.html`
  or `500.html` is served instead of being ignored.
- **`waitUntil`.** Pass `Bunny.v1.waitUntil`. Astro's cache providers need it to
  write without blocking the response.
- **`locals.runtime`.** Give every page `{ country, requestId, clientAddress, waitUntil,
caches, env }`, read from `cdn-requestcountrycode`, `cdn-requestid` and the SDK.
  This matches `Astro.locals.runtime` on Cloudflare. Add an `App.Locals` type.
- **Asset manifest.** `astro:build:done` knows every file in `dist/client`. Inline
  that list into the bundle. A request then reads Storage once, or not at all,
  instead of probing `<route>/index.html` and then `<route>.html`. Fall back to
  probing above a file-count limit, so a very large site does not bloat the bundle.
- **`staticHeaders: true`.** Take `routeToHeaders` from `astro:build:generated` and
  apply those headers when the script serves that page from Storage. Bunny Storage
  has no `_headers` file, so the script is the only place this can work.

## Phase 4 — Platform features

**Bunny Optimizer image service** — `packages/astro/src/image-service.ts`, an
`ExternalImageService`. `getURL` returns the asset path plus Optimizer query
parameters, and `getSrcSet` generates the widths. The mapping is direct:

| Astro                          | Optimizer                                |
| ------------------------------ | ---------------------------------------- |
| `width`, `height`, `quality`   | `width`, `height`, `quality`             |
| `format`                       | `format` (`webp`, `jpeg`, `png`, `avif`) |
| `fit: "cover"` with both sides | `crop=w,h`                               |
| `position`                     | `crop_gravity`                           |

The URL is origin-relative, so the same pull zone serves it and no host setting is
needed. Remote images pass through untouched, because Optimizer only handles
assets on your own zone. The option becomes
`imageService: "bunny" | "noop" | "compile" | false`, and the default stays
`"noop"`. Optimizer is a paid pull-zone feature, so we must not switch it on for
somebody without asking.

**Session driver** — `packages/astro/src/session.ts`, exported as
`@bunny.net/astro-adapter/session`. Astro's contract is three methods,
`getItem`, `setItem` and `removeItem`, from `astro/dist/core/session/types.d.ts`.
Bunny Storage answers `GET`, `PUT` and `DELETE`, so the driver is thin. The adapter
sets it as the default when the project turns sessions on. The write password comes
from `BUNNY_STORAGE_KEY` at runtime, never from the build config.

**CDN cache provider** — `packages/astro/src/cache.ts`, exported as
`@bunny.net/astro-adapter/cache`. Astro's `CacheProvider` wants `setHeaders` and
`invalidate`, and bunny.net has the exact match:

- `setHeaders` writes `Cache-Control: public, max-age=…, stale-while-revalidate=…`,
  the `CDN-Tag` header for the tags, and `ETag` or `Last-Modified`.
- `invalidate({ tags })` calls `POST /pullzone/{id}/purgeCache` with `CacheTag`.
- `invalidate({ path })` calls the Purge URL endpoint.

It reads `BUNNY_API_KEY` and `BUNNY_PULLZONE_ID` from the script environment. This
gives Astro `routeRules` on bunny.net, which is what Netlify and Vercel offer.

## Phase 5 — Developer experience

- **`astro preview`.** Add `previewEntrypoint`. It starts the storage emulator over
  `dist/client`, then runs the bundle. It uses Deno when Deno is present, because
  Deno is the real runtime. Without Deno it rebuilds the server entry against the
  SDK's Node build with esbuild, and runs that on Node. Either way `astro build &&
astro preview` shows the real edge bundle, offline.
- **`bunny-astro deploy`.** One command that uploads `dist/client` and then deploys
  the script. Today that is two commands, and forgetting the first one silently
  breaks the styles. Keep `upload` as it is, and add `--delete-stale` to remove
  objects the build no longer produces.
- **esbuild escape hatch.** Add `external`, `sourcemap`, and an `esbuild(options)`
  hook, so a project with an awkward dependency is not stuck.

## Phase 6 — Documentation

- Rewrite `packages/astro/README.md` around the new options and the demo.
- Update `../documentation/scripting/frameworks/astro.mdx`: the new repository URL,
  the image service, sessions, cache tags, `astro preview`, `bunny-astro deploy`,
  and a link to the live showcase. That repository takes a branch and a pull
  request, as its history shows.

## Verification

1. `npm run check` and `npm test` pass. `publint` and `arethetypeswrong` are clean.
2. `npm run test:e2e` passes offline. Deno must be installed first; it is absent
   from this machine.
3. Every check in `examples/astro-showcase/e2e/checks.mjs` passes against the Deno
   bundle behind the storage emulator, including the prerendered 404.
4. `astro build && astro preview` in the showcase serves the site with its assets,
   with Deno and again without it.
5. Manual live proof: deploy the showcase with `scripts/deploy-demo.mjs` and run the
   same checks against the real URL. I intend to reuse the existing script
   `astro-ssr-demo` (id 86027, https://astro-ssr-demo.bunny.run) and the storage
   zone `astro-ssr-demo`, both left over from the earlier work. Say so if you would
   rather I create new ones.
6. `gh repo view BunnyWay/bunny-adapters` shows the rename, and CI is green on a
   pull request.

The leftover `astro-hello-world` script and `astro-scripting-demo` zone are not
touched. I will ask before deleting anything.

## Plan lifecycle

The repository plan lives at `plans/monorepo-and-astro-adapter-v2.md`. It is
committed alone first, and no code goes in that commit. The implementation follows
in its own commits. Then the plan gets its "Built" note with the date and the
as-built differences. Then it is deleted, and everything is pushed.
