# Make `bunny deploy` work on real Astro projects

> **Built, 19 August 2026.** All three projects deploy with one `bunny deploy`,
> and the live sites answer. What the work found that this plan did not expect is
> at the end, under "What changed on the way".
>
> | Project             | Result                                                                                                            |
> | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
> | starlight (`docs/`) | 1653 files, 108 MB, script 7.0 MB. Pages, 17 locales, own 404 page                                                |
> | astro.build         | 8828 files, 1.4 GB, script 7.4 MB. `/themes/`, `/integrations/` and `/api/v1/integrations` all render per request |
> | astrowind           | 67 files, 7.5 MB, script 565 kB. Pages, and its own 404 page                                                      |
>
> Verified against live sites: a prerendered page, a locale, an on-demand route,
> an on-demand endpoint, and an unknown path. The adapter's three test tiers all
> pass (110 unit, 149 fixture, and the end-to-end run), and so do the CLI's 937
> tests. The adapter came from a local registry, because it is still unpublished.

`bunny deploy` and the Astro adapter were built against small projects. This plan
records what happened when three real projects met them, and what to change.

The three projects are `withastro/starlight` (its `docs/` site),
`withastro/astro.build`, and `arthelokyo/astrowind`. All three use Astro 7. Each
one is a shape our own fixtures do not have.

## What happened

The test drove `bunny deploy` through a real terminal, and answered every prompt
the way a hopeful developer would.

| Project             | Result                                                          |
| ------------------- | --------------------------------------------------------------- |
| starlight, at root  | Failed. `pnpm add` refused to add to a workspace root           |
| starlight, in docs/ | Failed. `npm install` ran in a pnpm workspace, on `workspace:*` |
| astro.build         | Failed twice. First the config, then a 22 MB script             |
| astrowind           | Deployed, but as static files. The prompt promised the edge     |

None of the three "just worked". Every failure is in the CLI or the adapter, and
each one has a small fix.

## Eight defects

### 1. A hybrid site deploys as static, and loses every dynamic route

The adapter writes `kind: "static"` when `config.output === "static"`. Since
Astro 5, `output: "static"` is the default, and a page opts out of prerendering
with `export const prerender = false`. So a static-output project can still have
routes that render per request.

`astro.build` has nine such routes, `/themes` and `/integrations` among them. The
adapter wrote `kind: "static"`, so `bunny deploy` would upload the files and
deploy no script. The site would go up, and every dynamic route would be missing.
Nothing in the output says so.

**Fix.** Decide from the routes, not from `output`. The `astro:routes:resolved`
hook reports `isPrerendered` for each route. `kind` is `ssr` when any route is
not prerendered.

### 2. The CLI sets `output: "server"`, which triples the script

`patchAstroConfig` adds `output: "server"` when the config has no `output` key.
For Astro 5 and later that is the wrong default: it turns every prerendered page
into a page that renders per request.

Measured on `astro.build`:

| Config                                  | Script size | Result                    |
| --------------------------------------- | ----------- | ------------------------- |
| `adapter: bunny()`, no `output`         | 7.83 MB     | Under the limit           |
| `adapter: bunny()` + `output: "server"` | 22.30 MB    | Refused; 10 MB is the cap |

The project also lost 4499 prerendered pages, which the CDN would have served
from storage for nothing.

**Fix.** Add the adapter and nothing else. Astro's own default is correct, and a
page that wants the edge already says `prerender = false`.

### 3. The package manager is detected in the wrong directory

`detectPackageManager` looks for a lockfile beside the project. In a monorepo the
lockfile is at the root, so `starlight/docs` looked like an npm project. `npm
install` then met `"@astrojs/starlight": "workspace:*"` and stopped with
`EUNSUPPORTEDPROTOCOL`.

**Fix.** Walk up for the lockfile, as every package manager does.

### 4. `pnpm add` needs `-w` at a workspace root

At the root of `starlight`, `pnpm add` refuses to act without `-w`. The CLI
reported pnpm's raw error and stopped.

**Fix.** Detect the workspace root, and pass the flag each package manager wants.

### 5. A monorepo root offers to install an adapter for a site that is not there

`starlight`'s root `package.json` has `astro` as a development dependency, for
`astro check`. There is no Astro site at the root; the site is `docs/`. The CLI
detected Astro anyway, and offered to add an adapter to a package that builds
nothing.

**Fix.** An Astro project needs an Astro config file. When the directory has none
and the workspace holds exactly one project that does, offer that directory.
Name the candidates when there are several.

### 6. Another vendor's adapter stops the deploy with a vague message

`astro.build` uses `@astrojs/cloudflare`. `patchAstroConfig` refuses to edit a
config that already has an `adapter` key, which is right. What it says is not:

```
✖ This project has @bunny.net/astro-adapter, and the config needs one more change.
Add this, then re-run `bunny deploy`:
```

It does not name the file, does not name the adapter in the way, and its snippet
does not say that `adapter: cloudflare()` has to go. Moving to bunny.net from
another host is the most common first deploy there is, and this is the moment it
fails.

**Fix.** Recognise the adapters people move from, and offer the swap: replace the
import and the `adapter` value in one edit. Say what changed. An unknown adapter
keeps the manual path, with the file named and the line to replace quoted.

### 7. A site is created before the script is measured

`bunny deploy` checks the 10 MB limit inside `deployFramework`, after
`resolveSite` has created the storage zone, the Edge Script, and the pull zone.
`astro.build` therefore left three empty resources behind on the way to its
error. The code says a failing build must leave no site behind; the size check
belongs on the same side of that line.

**Fix.** Measure the script before anything is created.

### 8. Small things that add up

- The build prints `[ERROR] dist/index.js is 22.30 MB` and then `Complete!`, with
  exit code 0. A build that cannot be deployed should fail, and should name the
  dependencies that filled the file.
- A fully prerendered project still bundles a server that nothing deploys.
  `astro.build` spent that work on a 7.83 MB file, and `astrowind` on 565 kB.
- On the static path the CLI asks to build, builds, and then `sites deploy` asks
  to build again.
- `bunny deploy --name x` is ignored for a static build; the prompt still asks.
- An invalid custom domain answers `An error has occurred.`

## The shape after the fixes

One prompt, and it tells the truth:

```
$ bunny deploy
ℹ Astro detected, with no bunny.net adapter.
? Add @bunny.net/astro-adapter to astro.config.ts? (Y/n)
```

The adapter then decides what the project is, because only the routes know:

- Every route prerendered: no script, and `bunny deploy` uploads `dist/client`.
- Any route on demand: one script, and the files it renders from.

Which means `astrowind` deploys as files, `astro.build` deploys as a script plus
4499 prerendered pages, and `starlight/docs` deploys as files. Nobody typed
anything about output modes.

## Work, in order

Adapter, in this repo, on `main`:

1. Add the `astro:routes:resolved` hook, and take `kind` from the routes.
2. Skip the bundle when no route renders on demand. Keep writing
   `.bunny-adapter.json`, which `astro preview` needs.
3. Fail the build when a script that will be deployed is above 10 MB, and list
   the five largest inputs from the esbuild metafile.
4. Replace the `output is "static"` warning, which gives wrong advice, with a
   line that says what will be deployed.

CLI, on `feat/framework-deploys`:

5. `detectPackageManager` walks up, and reports the workspace root.
6. The install command carries the root flag when the target is a workspace root.
7. `patchAstroConfig` stops adding `output: "server"`.
8. `patchAstroConfig` replaces a known vendor adapter, and says so.
9. An Astro project must have an Astro config. Offer the workspace's project when
   the current directory has none.
10. Move the 10 MB check before `resolveSite`.
11. The static path does not ask to build twice, and honours `--name`.

Documentation, on `docs/edge-scripting-astro-guide`:

12. Drop the instruction to set `output: "server"`. Say that the adapter follows
    the project's own routes, and that a prerendered page is served from storage.
13. Say what the 10 MB limit means in practice, and how to see what fills it.

## How this is verified

The three projects, cloned fresh, each deployed with one `bunny deploy`. The
adapter comes from a local registry, because it is not published yet. For each
one, record the prompts answered, the script size, the file count, and the URL.
Then fetch a prerendered page and a dynamic page from the live site.

`npm test`, `npm run test:fixtures` and `npm run test:e2e` cover the adapter
change. A fixture for a hybrid project is the one this repo does not have, and
defect 1 is the reason to add it.

## What changed on the way

Six things this plan got wrong or did not know.

**The bundle is still built for a static site.** Step 2 said to skip it. It
cannot be skipped: `astro preview` runs that file, so a fully prerendered project
would lose its preview server. The build writes it, the manifest names no script,
and the log says which of the two it is.

**`kind: "static"` needs a stronger test than "no route renders on demand".**
Starlight deployed as files, and the CDN answered its 404 page with bunny.net's.
Bunny Storage holds objects and nothing else: it cannot answer a missing object
with a page, cannot redirect, and cannot add a header. So a static kind now means
plain files behave the same, and a 404 page, a prerendered redirect or a route
header each mean the script goes too. Most real sites have a 404 page, so most
real sites get the script even when every route is prerendered.

**Astro injects on-demand routes into every project.** `/_image`,
`/_server-islands/[name]`, and `/404` when the project wrote no 404 page. Counting
them made every project look like it needed a server. They are excluded by pattern
and internal origin. A prerendered site whose only on-demand work is a
`server:defer` island cannot be told apart from one with no island at all, so it
has to say `deploy: "server"`. That is the new adapter option.

**10 MB is not the size that works.** astro.build built a 7.83 MB script,
deployed with no complaint, and served nothing: the edge answered 400 with an
empty body to every request. Measured with the same code at different sizes on a
standalone script in DE, in the units the adapter prints: 7.44 MB served every
request, 7.83 MB served none, and around 7.5 MB the first request failed and later
ones worked. A script has 500 ms to start and every byte of it is parsed first,
which is the reason. So the adapter warns above 7.5 MB, the inlined asset manifest
is capped at 5000 files rather than 20 000 (8824 paths cost 410 kB, and dropping
them is what made astro.build start), and `bunny deploy` asks the site for a page
before it reports success. The limits page and the guide now say it too.

**A deploy has to check its own work.** Nothing in the CLI ever asked whether the
site it just published answers. That is how astro.build's 400 got a green line and
a URL. The check probes production up to three times, each with its own query, and
treats a redirect or a 404 as a working script.

**Two things are still open.**

- A site created as static cannot become a framework site. astro.build and
  astrowind were static before this change, and the next deploy refused: `"x" is a
static site, and this project builds a server.` The way out is a new site, which
  costs the URL. Nothing needs it yet, because the CLI is unreleased, but a project
  that grows its first dynamic route will.
- `imageService` still defaults to `noop` for every build. A fully prerendered
  project could keep Astro's own service and have `sharp` resize at build time, but
  the image service is chosen in `astro:config:setup`, and the routes are not known
  until after it. The build now says how many images went up untransformed, and
  what to pass. astro.build sent 1.3 GB of them.
