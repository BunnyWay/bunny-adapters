# The static layer belongs to `bunny sites`

> **Built on 2026-08-20.** The adapter is `6755e10` in this repository, the CLI
> is `c2de63f` on `feat/framework-deploys`, and the documentation is `2e8d360`
> on `docs/edge-scripting-astro-guide`.
>
> **Verified offline, and nothing against a live account.** The adapter passes
> all three tiers: 119 unit tests, 20 fixture suites each run on Deno, and the
> showcase end to end. The CLI passes its 572 tests, `tsc --noEmit`, and the
> linter. The router source is byte-identical to a file that `node --check`
> parses, and its parsing and matching functions are unit-tested by extracting
> them from the shipped string. **No deploy was made to bunny.net.** So router
> v4 and the zone setting are unproven against real hosts: the 404 page, the
> `_redirects` and `_headers` handling, and the `Cache-Control` the router now
> owns all still need one live site to confirm.
>
> **What turned out differently.**
>
> - Declaring `buildOutput` left **no `dist/server` at all**, not an empty one,
>   and no bundle. `preserveBuildClientDir` kept `dist/client` in place, so
>   `assets.dir` did not move. Astro's answer agreed with the old route count on
>   every fixture.
> - **`build.redirects: false` was not set** (item 8). With it, Astro drops a
>   redirect route before it records the headers (`core/build/generate.js:341`),
>   so `routeToHeaders` loses every redirect and with it the expanded paths of a
>   dynamic one like `/legacy/[id]`. Astro keeps writing its meta-refresh pages,
>   and the rules in `_redirects` carry Netlify's `!` force marker instead, which
>   is what makes the router's real 301 win over the page.
> - **The router reads its configuration through a reserved path**,
>   `/_bunny/router/<name>` with a four-name allowlist, and not through a marker
>   header. A header shares a CDN cache key with a client request for the same
>   path, so a forged one could have had a header-less response cached for
>   everybody.
> - **A rewrite (`_redirects` status 200) is not supported.** It would have the
>   router fetch another path of its own site, and two rules can make that loop.
>   It is the one thing in the subset both hosts agree on that we left out, and
>   the SPA fallback is what would want it.
> - **The immutable asset rule comes from `_headers`, not from the router.** The
>   router will not guess which directory holds hashed files; the adapter names
>   it (`/_astro/*`), and every other preset can too. The router's own default
>   is `public, max-age=60` for a document and `public, max-age=2592000` for
>   anything else, which is what the zone override used to force on everything.
> - **The health check lived in `commands/deploy/framework.ts`,** not in the
>   `health.ts` the plan named. That module now exists, `findDeployFault` moved
>   into it, and `findMissingPageFault` joined it. It compares the answer with
>   the deploy's own `404.html` bytes rather than trying to recognise bunny.net's
>   page, and it runs on the static path too, which is where the fault happened.
> - **`deploy-prefix` needed a fixture of its own.** It borrowed
>   `static-output`, which now builds no script, and two suites building one
>   fixture were racing anyway.
> - **The `astro preview` test drives Astro's programmatic `preview()`.** The
>   `astro preview` command detects an agentic environment and daemonises, so the
>   spawned process exits before the server answers.
>
> **What was decided, not measured.** The cache override is off, and HTML gets
> `max-age=60`. The edge hit rate for HTML was not measured either side of that,
> and it is one constant away from any other answer. The open question below
> stands.
>
> **What was not built.** CLI item 3, converting a static site to a framework
> site in place. The plan gates it on phase 2 of `one-command-deploys.md`, which
> has not shipped, and doing it before that means a zone change instead of
> adding a script.

A fully prerendered site is a `bunny sites` site. It is not an adapter feature.
This plan moves the 404 page, the redirects, and the headers out of the adapter,
and into the CLI, where every framework gets them.

It also corrects one decision we already shipped, and it explains why.

## What we got wrong

Three real projects went through `bunny deploy` on 2026-08-19. Two faults came
out of it, and we fixed both. One fix was right, and one was wrong.

**Right.** `config.output` cannot say whether a project needs a server. Since
Astro 5, `output: "static"` is only a default, and a page leaves it with
`export const prerender = false`. We read `output`, called `withastro/astro.build`
static, and dropped its nine on-demand routes without a word.

**Wrong.** Starlight's docs deployed as files, and the CDN answered its 404 page
with bunny.net's. We fixed that by making a 404 page, a prerendered redirect, or
a header pull the Astro server bundle along (`c867e07`). That turns a site with
no server into a site with a megabyte of server, to gain three declarative
features. No other adapter does this.

## What the measurements say

Measured on 2026-08-20, on a throwaway site, and on this repository's fixtures.
Every cloud resource was deleted afterwards.

### The platform

| Test                                                             | Result                                                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Miss on a site with no error page                                | `404`, bunny.net's page. This is the Starlight fault.                                         |
| `bunnycdn_errors/404.html` at the zone root                      | `404`, **the uploaded page**, although the router had rewritten the path to `/deploys/{id}/…` |
| `deploys/{id}/bunnycdn_errors/404.html`                          | **Ignored.** The zone-root page still answered.                                               |
| The same miss on a preview host                                  | The production page. One zone holds one error page.                                           |
| A router that reads a redirect map, a header map, and a 404 page | All three work. 112 lines, and nothing in them is Astro-specific.                             |
| An asset with `CacheControlMaxAgeOverride: 2592000`              | The script sent `max-age=31536000, immutable`. The client got `max-age=2592000`.              |
| The same asset with the override at `-1`                         | The client got `max-age=31536000, immutable`.                                                 |

Two more facts came out of the same runs. `IgnoreQueryStrings` is on, so a `?cb=`
cache-buster does nothing; test with new paths. A 404 answers `no-cache`, so the
CDN caches no miss, and every miss runs the script.

### Astro

`astro:config:done` gives the adapter `buildOutput`. Astro sets it to `"server"`
when any route leaves prerendering (`core/routing/prerender.js:21`). It agreed
with our own route count on all eight fixtures, and it needs no list of injected
routes.

| Fixture                                | `config.output` | Astro `buildOutput` |
| -------------------------------------- | --------------- | ------------------- |
| files-only                             | static          | static              |
| static-output                          | static          | static              |
| hybrid                                 | static          | **server**          |
| redirects, csp, i18n, islands, actions | server          | server              |

`setAdapter` overwrites the value unless the adapter declares it
(`integrations/hooks.js:292`). Read it as the first statement of the hook:

```
PROBE before setAdapter buildOutput=static
PROBE after  setAdapter buildOutput=server
```

Declaring `adapterFeatures.buildOutput` made Astro build no server entry at all.
`dist/server` came out empty, and `preserveBuildClientDir` held `dist/client` in
place. The adapter's own bundle step then failed, because there was no entry to
bundle. That is the work item, and it is the point.

### A static Astro project needs no adapter

A project with no adapter, two pages, a 404 page, and two redirects builds this:

```
dist/404.html
dist/about/index.html
dist/gone/index.html     <meta http-equiv="refresh" content="2;url=/about">
dist/index.html
dist/old/index.html      <meta http-equiv="refresh" content="0;url=/about">
```

`bunny sites deploy dist` serves that directory today. Only two things are lost:
a redirect with a real 301 status, and a CSP header.

## Why the other adapters keep a static case

Each of them generates the files that configure their host.

| Adapter    | Writes for a static build                                        |
| ---------- | ---------------------------------------------------------------- |
| Cloudflare | `wrangler.json`, an assets-only worker, `_headers`, `_redirects` |
| Netlify    | `_redirects`, `.netlify/v1/config.json`                          |
| Vercel     | `.vercel/output/config.json`                                     |

Bunny has no such file. `bunny sites` uploads a directory, and a generic router
serves it. `FRAMEWORK_PRESETS` in the CLI already holds about thirty static
frameworks. Astro is one row, and it is the only row with an adapter, because it
is the only one that also renders per request.

So the reason does not transfer. The static case belongs to the CLI.

## The decision

Three rules.

1. **The adapter reports what a build needs. It never chooses how the host serves
   it.**
2. **The CLI serves a directory of files, and it stays framework-neutral.** It
   reads `404.html`, `_redirects`, and `_headers`, which are host-standard names.
   It reads no Astro-shaped manifest field.
3. **A site with no on-demand route gets no script from the adapter.** It gets
   the sites router, like a Hugo site.

## Adapter changes

`packages/astro/src/index.ts`, unless another file is named.

1. **Take `buildOutput` from Astro.** Read it as the first statement of
   `astro:config:done`. Declare it back:

   ```ts
   adapterFeatures: {
     staticHeaders: true,
     buildOutput: deploy === "server" ? "server" : buildOutput,
     preserveBuildClientDir: true,
     preserveBuildServerDir: true,
   }
   ```

   The peer range is `astro ^7.0.0`, so all four fields exist.

2. **Delete the route counting.** Remove `astro:routes:resolved`,
   `ALWAYS_INJECTED`, `onDemandRoutes`, and the `outputMode` fallback.

3. **Build no script when the output is static.** `astro:build:done` must not
   call `bundleServer`. Astro emits no entry, so esbuild fails today.

4. **Omit `previewEntrypoint` when the output is static.** Astro then runs its
   own static preview server (`core/preview/index.js:33`). No preview work is
   needed in `packages/astro/src/preview.ts`.

5. **Revert `c867e07`.** A 404 page, a redirect, or a header no longer forces a
   script. `kind: "static"` means "no route renders on demand" again.

6. **Say the adapter is not needed.** When every route is prerendered, log it:
   no script is deployed, `bunny deploy` uploads the files, and the adapter can
   be removed unless a route becomes dynamic, or a `server:defer` island exists.

7. **Keep the size checks for server builds only.** The 10 MB failure and the
   7.5 MB startup warning do not apply when nothing is deployed.

8. **Optional, and it gates nothing: write `_redirects` and `_headers`.** They
   are the only two things a static Astro build cannot express. Write them into
   `dist/client`, and set `build.redirects: false` so Astro stops writing
   meta-refresh pages. `mapsByObject` in `build/manifest.ts` already holds both
   maps. Cloudflare and Netlify write the same two files, and the format is
   theirs.

9. **Do not fail on a static project.** A project moves between the two kinds as
   its routes change. A build that breaks on the commit that prerenders the last
   dynamic route is hostile.

### Adapter tests

- `hybrid` stays `kind: "ssr"`. It is the regression test for item 1.
- `files-only` and `static-output` go back to `kind: "static"`, with no
  `dist/index.js` and an empty `dist/server`.
- `astro preview` serves a static fixture through Astro's own server.
- A unit test for the `_redirects` and `_headers` output, if item 8 ships.
- A changeset.

## CLI changes

All of it is framework-neutral, and all thirty presets get it.

1. **Router v4** (`commands/sites/router/source.ts`). Bump `ROUTER_VERSION`;
   `sites upgrade-router` already republishes it.
   - Answer a miss with the deploy's own `404.html`, at status 404.
   - Read `_redirects` and `_headers` from the deploy, and apply them.
   - Set an immutable `Cache-Control` under a hashed asset directory.
   - Load that configuration per deploy, and hold it in memory. Do not inline it
     in the script source: one script serves production and every preview, and a
     promotion must stay an environment variable change.

2. **Turn the cache override off, and then own `Cache-Control`.** Set
   `CacheControlMaxAgeOverride` to `-1` on a static site's pull zone. The zone
   default of 2592000 replaces whatever the script returns.

   **This item carries a consequence, and it is the largest risk here.** With the
   override off, the edge follows the origin, and Bunny Storage sends no
   `Cache-Control` for HTML. So the router must set one on every response, not
   only on an asset. Measure the edge hit rate before and after.

3. **Convert a static site to a framework site, in place.** A project that adds
   its first dynamic route must keep its URL. Today `bunny deploy` refuses a
   static site, and `sites deploy` refuses a framework site.

   A static site's pull zone has `OriginType: 2` and a storage zone. A framework
   site's has `OriginType: 4` and `EdgeScriptId`. So the move is a zone change
   today. Phase 2 of `one-command-deploys.md` makes a framework script middleware
   over the same storage origin. After that, the move only adds a script, and
   this item becomes small. **Do phase 2 first if both are on the table.**

4. **Check the 404 in the health check** (`commands/deploy/health.ts`). Request a
   path that cannot exist, and assert the site's own page comes back.
   `findDeployFault` already probes production. This one check would have caught
   Starlight.

5. Tests, and a changeset.

`bunny.net` also has a second 404 mechanism: `bunnycdn_errors/404.html` in the
storage zone. It works, and it needs no script. We do not use it, because one
zone holds one page: a preview would show the production page, and a rollback
would leave the wrong page behind.

## Documentation changes

Repository `BunnyWay/documentation`.

1. **`storage/static-site-hosting/index.mdx`.** The feature belongs to this page:
   `404.html`, `_redirects`, `_headers`, and the cache rules the router applies.
2. **`scripting/frameworks/astro.mdx`.** Say that a fully prerendered Astro site
   needs no adapter, and which command serves it. Say when a project does need
   one: a route that renders per request, or a `server:defer` island. Remove the
   text that says a prerendered site needs a script for its 404 page.
3. **`cdn/custom-404-page.mdx`.** Add the measured facts. The folder resolves at
   the zone root, a copy in a sub-folder is ignored, the status is 404, and it
   works with an Edge Script on the zone.
4. **New: `cli/commands/sites.mdx` and `cli/commands/deploy.mdx`.** Neither
   command has a page. `cli/commands/` holds `scripts`, `db`, and `dns` already.

## Order

1. Adapter items 1 to 7, with their tests. Nothing else depends on more.
2. CLI items 1 and 2, together. Item 2 alone changes cache behaviour, so it must
   not ship without the router that supplies the headers.
3. CLI item 4, the health check.
4. Adapter item 8, `_redirects` and `_headers`, and the CLI support for reading
   them.
5. CLI item 3, the migration. After phase 2 of `one-command-deploys.md`.
6. Documentation, in the same pull request as the code it describes.

## Open questions

**The cache override.** Turning it off is a live change to every static site's
cache. The alternative is to keep it, and to drop the immutable asset header.
Measure the edge hit rate on a test zone first.

**When the migration blocks a release.** No user is affected today, because the
CLI is unreleased. An early project that adds a dynamic route later loses its
hostname. Decide whether that blocks the first release, or whether a documented
limit is enough.

**`_redirects` and `_headers` are a de facto standard, not a specification.**
Cloudflare and Netlify differ in the details. Support the subset both agree on,
and say in the documentation which subset that is.
