# One command deploys: what is left

**Phase 1 shipped.** `bunny sites deploy` deploys an Astro site end to end, and
this document now holds only the work that is not done. The design it replaced is
in git: `git log -- plans/one-command-deploys.md` finds the original, and the
commit that shrank it to this.

## What shipped, and what it proved

The build writes `.bunny/build.json`. The CLI reads it, so it deploys this
adapter without knowing anything about Astro.

```bash
bunny sites deploy                           # provision, build, upload, publish
bunny sites deployments publish --previous   # back to the deploy that was live before
```

Verified against a real account on 2026-08-19, with a fresh
`npm create astro@latest` project:

| Check                                     | Result                                                      |
| ----------------------------------------- | ----------------------------------------------------------- |
| Adapter offered, installed, config edited | `adapter: bunny()` written for us, and `output` left alone  |
| Site provisioned from nothing             | storage zone, script, pull zone, all named `sites-<name>-*` |
| Server-rendered page                      | 200, `private, no-store`, a new time on each request        |
| Prerendered page from Storage             | 200, `public, max-age=60`                                   |
| Endpoint in `src/pages/api/`              | 200, JSON, per-request values                               |
| Asset from Storage                        | 200, `public, max-age=31536000, immutable`                  |
| Deploy folder pinned into the bundle      | the page reports its own deploy id                          |
| Unchanged redeploy                        | "No changes", nothing uploaded                              |
| Rollback                                  | previous page and its assets both came back, in about 5 s   |

Three things turned out differently from the design:

- **The pull zone reports `StorageZoneId: -1`,** not `null`, when a script is its
  origin. Site discovery has to treat any value below 1 as absent, or
  `bunny sites list` never finds a framework site.
- **A publish is not instant.** The CLI waits for the release to reach the nodes
  and purges again, because a probe cannot tell the outgoing release from the
  incoming one: both answer 200 with a page. Without the wait the command
  reported success while the site still served the previous release.
- **No `requires.cliVersion` floor is set yet.** Both sides are unreleased, so
  there is no version to rule out. `manifestVersion` already stops a CLI that
  cannot read the shape, and an older CLI has no framework path at all. Set a
  floor once a released CLI has to be ruled out.

Phase 1 kept the standalone-script architecture the adapter already had: the
script reads Storage over HTTP, with a read-only password the CLI sets. That is
what phase 2 below changes.

## Phase 2 — serve assets through the pull zone

The script fetches every asset from the Storage API and returns the bytes itself.
That costs a subrequest against a budget of 50, and it puts a password in the
script.

A middleware script on a storage-backed pull zone needs neither. It rewrites the
path and returns the **request**, and the CDN reads the storage origin itself,
exactly as the static sites router does:

```ts
url.pathname = `/${assetPrefix()}${url.pathname}`;
return new Request(url, request);
```

What this wins:

- No storage password for assets. One less secret, and one less failure.
- No subrequest per asset. The budget goes back to the developer's code.
- Range requests, `304`s, and large objects are the CDN's job again.
- The same pull zone shape as a static site, so one CLI code path serves both.
- Bunny Optimizer reads a storage origin, and cannot read a script origin. So
  this may also fix images. **Measure it. Do not claim it.**

What it costs:

- The script becomes a middleware script, not a standalone one. Astro's own
  routes still come from `onOriginRequest`, which may return a Response.
- Static page headers move to `onOriginResponse`, because the CDN now serves the
  page. Astro's `staticHeaders` feature keeps working, from the other hook.
- `astro preview` has to follow the rewrite locally. `startLocalZone` already
  serves the objects.
- A storage password is still needed for sessions, and only for sessions.
- **An existing framework site cannot migrate in place.** A script's type is
  fixed when it is created, and the pull zone's origin type changes with it. So
  this needs a migration that creates a new script and a new pull zone, and moves
  the domains across. Write it, or accept that sites made in phase 1 stay as they
  are.

Verify before going far: a Response returned from `onOriginRequest`, `waitUntil`,
the Cache API, and the cold-start budget. If any of it is worse, stop, and phase 1
stands.

## Phase 3 — preview environments

A server build publishes to production, and `bunny sites deploy` says so. There
is no `--preview` at all, and that is the largest gap between the guide's promise
and the CLI.

A framework site's preview cannot be a snapshot. One script publishes one release
at a time, and the rendered page and its assets are one unit: an Astro server
bundle names the hashed CSS file it renders. So a preview URL is an
**environment**, not a deploy:

```
site "my-site"
├─ storage zone                     shared: deploys/{id}/ and _bunny/deploys/{id}/server.js
├─ environment "production"         pull zone + script
└─ environment "preview" | "pr-42"  pull zone + script, same storage zone
```

- `bunny sites deploy` updates the site's `preview` environment; `--prod`
  publishes to production; `--preview pr-42` creates and updates that one.
- Promotion is already build-once-deploy-anywhere: every deploy's bundle is in
  storage, so publishing deploy X to production reads it back and publishes it.
  `republishDeploy` in the CLI does exactly this today.
- Give an environment a lifetime, and delete it when its pull request closes. A
  repository with 20 open pull requests would otherwise hold 20 pull zones and 20
  scripts.

Say the limit plainly in the guide. Per-commit preview URLs for server rendering
need one script per commit, which is a platform cost decision rather than a CLI
one. If Edge Scripting ever routes a hostname to a chosen release, this collapses
into the static model and only the CLI changes.

## Phase 4 — the rest of the loop

- **`bunny ci init` for framework sites.** The workflow shape is the same:
  `bunny sites deploy --preview pr-N` on a pull request, and
  `bunny sites deploy --prod` on a merge, with the preview URL as a comment.
  Needs `BunnyWay/actions/deploy-site` to accept a preview name.
- **`bunny env` at the top level,** mapped to the live environment's script, with
  `bunny env pull` into `.env`. Today it is `bunny scripts env set`, which means
  knowing which script id belongs to which site.
- **`bunny logs`.** Logs are dashboard-only, so this needs an API first. Leave it
  out of the guide until it exists.
- **`bunny init astro`.** Scaffold a project with the adapter already in place,
  so the first command is `bunny init` and the second is `bunny sites deploy`.
- **Adopt an existing site.** `scripts/deploy-demo.mjs` now runs
  `bunny sites deploy`, which creates a new CLI-managed site rather than reuse the
  demo's existing zone and script. A `bunny link` that adopts a hand-built pair
  would fix that, and the guide's "Moving from `bunny-astro`" section promises it.

## Open questions

**`BUNNY_API_KEY` for cache purging is account-wide.** The CLI sets the pull zone
id and asks before it puts a key on a script. Ask the platform for a token scoped
to purging one pull zone.

**Two adapters are the real test of the manifest.** One adapter always fits its
own contract. Write the second one, or a throwaway, before calling
`manifestVersion: 1` stable.

**The CLI's framework detection carries the adapter package per preset.** That
list is where a new adapter becomes discoverable, and it is in the CLI
repository, not this one. Adding an adapter therefore still needs one small CLI
change: a package name, and how to add it to that framework's config.
