# One deploy command: `bunny sites deploy`

`bunny deploy` is a second deploy command, and the CLI does not need one. `bunny
sites deploy` already deploys a directory of files. This plan makes that command
deploy a server build too, and removes `bunny deploy` and `bunny rollback`.

Nothing here has shipped. `bunny deploy` lives only on the CLI branch
`feat/framework-deploys`, and the guide for it lives only on the documentation
branch `docs/edge-scripting-astro-guide`. So this is a rename and a merge, not a
migration: no user has the old command.

## Why

A developer with an Astro project must not choose a command. The project decides
whether a route renders per request, and the CLI reads that decision from the
build. Two commands make the developer answer a question the build already
answered.

`bunny sites` also owns everything around a deploy: the site list, the deploy
history, the domains, and the CI workflow. A framework site is a site. It keeps
its files in the same storage zone, at the same `deploys/{id}/` paths, and it
reports in `bunny sites list` today.

## What the command does

```bash
bunny sites deploy                 # build if needed, then deploy
bunny sites deploy --build         # run the project's own build first
bunny sites deploy ./dist          # deploy a directory of files
bunny sites deploy --production    # publish a static deploy as the live site
```

The command reads `.bunny/build.json`, the manifest a framework adapter writes.
The manifest decides the path:

| What the command finds       | What it deploys                                       |
| ---------------------------- | ----------------------------------------------------- |
| `kind: "ssr"`                | An Edge Script, plus the client files in Bunny Storage |
| `kind: "static"`             | The files at `assets.dir`, as any static site          |
| No manifest                  | The directory, as today                                |

## How a project that needs a server is found

The manifest exists only after a build with the adapter in place. Before that,
the command reads the project. An Astro project asks for a server when one of
these is true:

1. The Astro config names another vendor's adapter, such as `@astrojs/cloudflare`.
2. The Astro config sets `output: "server"`.
3. `@bunny.net/astro-adapter` is a dependency, or the config already names it.
4. A file under `src/pages/` holds `export const prerender = false`.

Any one of these starts the adapter offer that `bunny deploy` has today: install
the package, and add it to the config. The build then writes the manifest, and
the deploy follows it.

A project with none of these signals is static. The command builds it and
uploads the output, exactly as it does now. It never mentions the adapter, and it
never edits the config. An Astro site that is happy as files stays as files.

Signal 4 is the one that matters most. Astro 5 prerenders every page unless a
page opts out, and `astro build` stops with its own error when a page opts out
with no adapter installed. So the offer arrives before the build fails, and not
after.

The scan reads `src/pages/` only, because `prerender` applies to a route. It
stops at the first match.

## Where the code goes

The `deploy/` directory becomes part of `sites/`:

| Now                     | After                        | Holds                                       |
| ----------------------- | ---------------------------- | ------------------------------------------- |
| `deploy/manifest.ts`    | `sites/build-manifest.ts`    | Reads `.bunny/build.json`                    |
| `deploy/health.ts`      | `sites/health.ts`            | Asks a fresh deploy for a page              |
| `deploy/api.ts`         | `sites/framework/api.ts`     | Provisions and publishes a framework site   |
| `deploy/framework.ts`   | `sites/framework/deploy.ts`  | The framework deploy and the republish      |
| `deploy/adapter.ts`     | `sites/framework/adapter.ts` | The adapter offer and the config edit       |
| `deploy/project.ts`     | `sites/framework/project.ts` | Finds the project in a workspace            |
| `deploy/index.ts`       | Deleted                      | Its work moves into `sites/deploy.ts`        |
| `deploy/rollback.ts`    | Deleted                      | `sites deployments publish --previous`        |

`health.ts` and `build-manifest.ts` sit directly under `sites/`, because both
deploy paths read them. Everything a framework site alone needs sits under
`sites/framework/`.

## The order inside `sites/deploy.ts`

1. Read the manifest. Walk into the project below a workspace root, if this
   directory holds no project.
2. With no manifest, read the project. Offer the adapter when the project asks
   for a server.
3. Build. `--build` runs a named command, and an interactive run offers the
   detected one.
4. Read the manifest again, because the build writes it.
5. Choose the site. `--site`, then `.bunny/site.json`, then `bunny.jsonc`, then
   the picker, which offers to create one.
6. Deploy, on the path the manifest chose.

Step 3 moves ahead of step 5, and that is a fix. Today `bunny sites deploy`
creates the site first, so a failing build leaves an empty site behind. `bunny
deploy` builds first for exactly this reason.

## What the site kinds mean at the picker

Site state carries `kind`, and `isFrameworkSite()` reads it. A framework site's
script is the build's own server. A static site's script is the router this CLI
writes. A script cannot change type after the API creates it.

So the deploy compares the build with the site, and stops on a mismatch:

- A server build with a static site: "this project builds a server, and
  `<name>` is a static site".
- A static build with a framework site: "`<name>` serves a build with its own
  server, and this build has none".

Both messages name the way out: deploy to another site, or delete this one and
let the deploy create it.

`bunny sites create` still creates a static site. A project that renders per
request lets the deploy create its site, and the documentation says so. Creating
a framework site needs the manifest, and `sites create` runs no build.

## What the two paths share

Both paths end the same way, and today the code for that end is written twice:

- The first deploy of a domainless site offers a custom domain. The framework
  copy also prints `bunny domains add`, and no such command exists.
- Both ask the published site for a path it cannot hold, and check the answer is
  the deploy's own 404 page.

One helper serves both. The framework path keeps what only it has: the 10 MB
script check, the pull zone settings from the manifest, the script variables, and
the stored bundle.

## Rollback

`bunny rollback` goes. `bunny sites deployments publish --previous` does the same
work, for both kinds of site, and it already delegates a framework site to
`republishDeploy`.

## Flags on `bunny sites deploy`

| Flag                      | What changes                                                  |
| ------------------------- | ------------------------------------------------------------- |
| `--region`                | New. The storage region for a site this deploy creates        |
| `--production`, `--prod`  | Static only. A framework deploy publishes, because one script serves one release |
| `--built`                 | Gone. It told `sites deploy` that `bunny deploy` already built |

A framework deploy says once that it publishes to production, and that preview
environments are not built yet. It must not publish in silence, because the
static path defaults to a preview URL.

`--open` does not come across. `bunny sites open` is the command for that.

## Deploys that are deleted

`deployments prune` and `deployments delete` remove `deploys/{id}/`. A framework
deploy also keeps `_bunny/deploys/{id}/server.js`, and neither command deletes
it. Delete it with the deploy, or the bundles stay in the zone forever.

## What gets tested

- `projectNeedsServer`: each of the four signals, and a static project that
  matches none of them.
- The manifest decides the path: `ssr`, `static`, and no manifest.
- The kind mismatch stops the deploy, both ways.
- The moved tests keep passing under their new paths.

Verify against a real account before this is called done:

| Check                            | Why                                                  |
| -------------------------------- | ---------------------------------------------------- |
| A server Astro project           | The whole path, from no adapter to a live page        |
| A static Astro project           | The adapter is never mentioned, and `dist` goes up    |
| A static project with the adapter | `kind: "static"` deploys as files                    |
| A rollback                       | `deployments publish --previous` restores both halves |
| A kind mismatch                  | The message is the one above                          |

## The other two repositories

**The documentation.** `cli/commands/deploy.mdx` goes, and its content joins
`cli/commands/sites.mdx`. `docs.json` drops the page. The Astro guide and the
frameworks index name `bunny sites deploy`.

**This repository.** The adapter writes the same manifest, so no behaviour
changes. Its log lines, its README, and `docs/writing-an-adapter.md` name the new
command. `plans/one-command-deploys.md` describes work that is not done, and it
names `bunny deploy` throughout: the names change, and the design stands.
