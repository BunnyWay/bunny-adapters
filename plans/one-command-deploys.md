# One command deploys, for Astro and for every adapter after it

**Status:** design. Nothing here is built yet.

**Repositories this plan touches**

| Repository            | Change                                                     |
| --------------------- | ---------------------------------------------------------- |
| `BunnyWay/cli`        | Most of the work. Framework sites, `bunny deploy`           |
| `BunnyWay/bunny-adapters` | The build manifest, the deploy prefix, less command line |
| `BunnyWay/documentation`  | The Astro guide, written against the end state           |
| `BunnyWay/actions`    | The site deploy action, for continuous integration         |

The documentation change is already written, on the
`docs/edge-scripting-astro-guide` branch. It describes the end state. Do not
publish it before phase 3 is live.

## Why

A visitor to the Astro guide reads 5 steps before the site is up. The steps
ask for a storage zone, two passwords, a script, 3 environment variables, and
2 raw API calls. Each one is a place to make a mistake, and each mistake looks
like a broken site.

Today the developer does this:

```bash
npm install @bunny.net/astro-adapter      # then edit astro.config.mjs
npm run build
bunny api POST /storagezone --body '{"Name":"my-site-assets","Region":"DE"}'
bunny scripts create my-site --type standalone
bunny scripts env set BUNNY_STORAGE_ZONE my-site-assets
bunny scripts env set BUNNY_STORAGE_HOST storage.bunnycdn.com
bunny scripts env set BUNNY_STORAGE_KEY <read-only password> --secret
bunny api POST /pullzone/<id> --body '{"DisableCookies": false}'
bunny api POST /pullzone/<id> --body '{"EnableSmartCache": false}'
BUNNY_STORAGE_ZONE=my-site-assets BUNNY_STORAGE_KEY=<write password> \
  npx bunny-astro deploy
```

We want the developer to do this:

```bash
bunny deploy
```

The CLI already holds every part of the answer. `bunny sites` provisions a
storage zone, a pull zone, and an Edge Script as one unit. It uploads immutable
deploys, it gives each one a URL, and it promotes and rolls back by flipping a
single lever. It detects 30 frameworks. It writes a GitHub Actions workflow.

What it cannot do is let the framework own the script. That is the whole gap.

## The idea

**A framework site is a `bunny sites` site whose script comes from the build.**

A static site gets the router the CLI generates. An Astro site gets the bundle
the adapter builds. Everything else is the same: the same storage zone, the
same pull zone, the same `deploys/{id}/` layout, the same state file, the same
promote and rollback, the same domains, the same workflow.

So this plan adds one capability to the CLI, and then re-uses what is there.

## The target experience

### The first deploy

```
$ bunny deploy

  Astro 5.14 detected, with no bunny.net adapter.
  ? Add @bunny.net/astro-adapter and render on the edge? (Y/n) y

  Installed @bunny.net/astro-adapter, and set output: "server".

  Running build: npm run build
  ...
  Bundled to dist/index.js (664 kB, limit 10 MB).

  ? Site name: (my-site) my-site
  Created site "my-site".
    storage zone   sites-my-site-k3f9wq
    pull zone      sites-my-site-k3f9wq
    edge script    my-site-k3f9wq-server (Astro 5.14)
  Applied the settings this adapter asks for: cookies on, Smart Cache off.

  Uploaded 42 files (1.9 MB) as deploy a1b2c3d4.
  Published to production.

  Production  https://sites-my-site-k3f9wq.b-cdn.net
  ? Custom domain for production (blank to skip): www.example.com
  ...
```

The developer typed one command, one name, and one domain. No password moved
through the terminal. No API call was written by hand.

### Every deploy after it

```bash
bunny deploy                 # build, upload, publish to the preview environment
bunny deploy --prod          # publish to production
bunny deploy --prod --open   # and open it
bunny rollback               # back to the deploy that was live before
bunny deployments list       # what is live, what was live, what is kept
bunny env set STRIPE_KEY sk_live_… --secret
bunny ci init                # a workflow: previews on pull requests, production on main
```

Every one of those commands exists for static sites today, under
`bunny sites …`. This plan puts the short names at the top level, and makes them
work when the script is a framework's server.

## The model

```
site "my-site"
│
├─ storage zone  sites-my-site-k3f9wq         one content store, shared
│  ├─ deploys/a1b2c3d4/…                      the client build. Immutable
│  ├─ _bunny/deploys/a1b2c3d4/server.js       that deploy's bundle. Never served
│  ├─ _bunny/sessions/…                       Astro.session, when the site uses it
│  └─ _bunny/site.json                        the state: deploys and environments
│
├─ environment "production"
│  ├─ pull zone   sites-my-site-k3f9wq        the site's URL and its domains
│  └─ script      my-site-k3f9wq-server       the deploy that is live
│
└─ environment "preview"                      created on the first preview deploy
   ├─ pull zone   sites-my-site-prv-8xk2mq
   └─ script      my-site-k3f9wq-preview
```

Four rules hold this together.

**1. A deploy is content plus code, and the two never separate.** A deploy ID
is a hash of the client files and the bundle together. Astro puts the name of a
hashed CSS file inside the server bundle, so old assets with a new renderer is
a broken page. The pair is the unit.

**2. The bundle goes to storage as well as to the script.** The CLI writes it to
`_bunny/deploys/{id}/server.js`, which nothing serves. A promote or a rollback
then reads the bundle back and publishes it. Any retained deploy can go live in
one step, and it goes live with exactly the assets it was built against.

**3. The deploy prefix travels with the code.** The CLI adds one line to the top
of the bundle before it uploads it:

```js
globalThis.__BUNNY_DEPLOY__ = { id: "a1b2c3d4", assetPrefix: "deploys/a1b2c3d4", site: "my-site", environment: "production" };
```

The adapter reads that object, and falls back to the environment, and then to
the zone root. So the code and the prefix cannot drift apart. Publishing an old
release restores its prefix in the same operation.

**4. An environment is a pull zone and a script, over the shared storage zone.**
Production is one environment. A preview is another. They share content,
because content is addressed by hash and costs nothing to share.

### Why previews work differently here

A static site gets one preview URL per deploy, because the router serves any
deploy. Server rendering cannot do that: one script has one published release,
and the release is half of the deploy.

So a framework site gets one preview URL per **environment**, not per deploy.
`bunny deploy` updates the `preview` environment. `bunny deploy --preview pr-42`
creates and updates `pr-42`. A pull request keeps one URL that always shows its
newest commit, which is what a pull request comment needs.

Say this plainly in the guide. Per-commit preview URLs for server rendering
need one script per commit, and that is a platform cost decision, not a CLI
decision. If Edge Scripting ever routes a hostname to a chosen release, this
collapses into the static model, and only the CLI changes.

## The adapter contract

The CLI must not learn Astro. It learns one file instead.

Every adapter writes `.bunny/build.json` at the end of the build. The CLI reads
it and knows what to deploy. A new adapter needs no CLI release.

```jsonc
{
  "manifestVersion": 1,

  "adapter": { "package": "@bunny.net/astro-adapter", "version": "0.6.0" },
  "framework": { "name": "astro", "version": "5.14.1" },

  // "ssr" needs a script. "static" is files only.
  "kind": "ssr",

  "script": {
    "entry": "dist/index.js",
    "type": "middleware",
    "bytes": 664218
  },

  "assets": {
    "dir": "dist/client",
    // Paths that are safe to cache forever. The CLI reports them, and a
    // future version may set them per path.
    "immutable": ["_astro/**"]
  },

  // What the CLI has to arrange before the site works.
  "requires": {
    "cliVersion": ">=2.6.0",
    "pullZone": { "disableCookies": false, "enableSmartCache": false },
    "storage": { "write": true, "reason": "Astro.session" },
    "env": [
      { "name": "BUNNY_PULLZONE_ID", "reason": "Astro.cache.invalidate()" },
      { "name": "BUNNY_API_KEY", "secret": true, "optional": true, "reason": "Astro.cache.invalidate()" }
    ]
  },

  "dev": { "command": "astro dev", "preview": "astro preview" }
}
```

Rules for the file:

- The adapter writes it. The CLI only reads it.
- `manifestVersion` is a whole number. The CLI refuses a version it does not
  know, and names the CLI version to install.
- `requires.cliVersion` is the other direction. An old CLI stops with a clear
  message instead of deploying something it does not understand.
- Paths are relative to the project root, and use forward slashes.
- Everything the CLI must arrange goes in `requires`. The CLI applies it,
  reports what it changed, and never changes it back silently.
- The file is a build output. It is not configuration, and `.gitignore`
  covers it.

`docs/writing-an-adapter.md` in this repository holds the specification. The
CLI links to it. Both repositories change the file in the same week, or the
contract has already failed.

### What the CLI guarantees in return

| Name                     | Value                                        |
| ------------------------ | -------------------------------------------- |
| `__BUNNY_DEPLOY__.id`    | The deploy ID                                |
| `__BUNNY_DEPLOY__.assetPrefix` | `deploys/{id}`, the prefix for every asset |
| `__BUNNY_DEPLOY__.site`  | The site name                                |
| `__BUNNY_DEPLOY__.environment` | `production`, or the preview's name     |
| `BUNNY_SITE_STORAGE_ZONE` | The site's storage zone                     |
| `BUNNY_SITE_STORAGE_KEY`  | That zone's password. A secret              |
| `BUNNY_PULLZONE_ID`      | The environment's pull zone                  |

The script never holds a password the developer typed. The CLI creates the
zone, so it already knows the password, and it sets the variable as a secret.

## Work in the CLI

The CLI is a separate repository, and this plan does not change it. This
section is the specification to implement there.

### New and moved commands

| Command                     | What it is                                              |
| --------------------------- | ------------------------------------------------------- |
| `bunny deploy [dir]`        | `sites deploy`, at the top level, framework aware       |
| `bunny rollback [id]`       | `sites deployments publish --previous`                  |
| `bunny deployments …`       | `sites deployments …`                                   |
| `bunny env …`               | The live environment's script variables                 |
| `bunny ci init`             | `sites ci init`                                         |
| `bunny open`                | `sites open` (the dashboard keeps `bunny dashboard`)    |
| `bunny init <framework>`    | Scaffold a project with the adapter already in place    |
| `bunny logs`                | Tail the environment's script logs. Needs an API        |

`bunny sites …` keeps every name it has today. The short names are the front
door, and nothing breaks.

`bunny deploy` picks its path from what it finds:

1. `.bunny/build.json` exists and says `kind: "ssr"` → a framework site.
2. A framework is detected, and no adapter is installed → offer the adapter.
3. Otherwise → the static path that works today.
4. A `Dockerfile` or a `compose.yml`, and no web build → point at `bunny apps deploy`.

### Changes to `sites`

**`sites/api.ts`, `createSite`.** Take the script source and the script type
from the caller. A static site passes `routerSource` and `middleware`, as now.
A framework site passes the adapter's bundle. Add an `environments` map to
`RemoteSiteState`, with production as the first entry. Keep reading the old
shape, because sites exist already.

**`sites/deploy.ts`.** Read `.bunny/build.json` after the build. When it says
`ssr`:

- hash the client files and the bundle together for the deploy ID;
- upload the client files to `deploys/{id}/`, and the bundle to
  `_bunny/deploys/{id}/server.js`;
- inject `__BUNNY_DEPLOY__`, post the code to the environment's script, and
  publish it;
- purge the environment's pull zone;
- apply `requires` (see below), and report every change;
- record the deploy, with the release ID the compute API returns.

The no-change check keeps working: the same content plus the same code is the
same ID, so the deploy is a no-op.

**`sites/environments.ts`, new.** Create, list, and delete an environment. An
environment is a pull zone plus a script over the site's storage zone. Creation
is idempotent, and it looks each resource up by name first, exactly as
`createSite` does.

**`sites/requires.ts`, new.** Apply `requires.pullZone` to the environment's
pull zone, and `requires.env` to its script. Read the current values first, and
change only what differs. Print one line for each change. Never set a value a
developer changed by hand without saying so.

**`sites/deployments/publish.ts`.** Read `_bunny/deploys/{id}/server.js`, inject
the prefix, post, publish, purge. That is the whole of rollback for a framework
site.

**`sites/deployments/prune.ts`.** Delete `_bunny/deploys/{id}/` with the rest of
the deploy.

**`sites/ci/frameworks.ts`.** Add the adapter to each preset that has one, and
correct Astro. The preset says `dir: "dist"` today, which is right for a static
Astro site and wrong for a server one. The manifest decides once an adapter is
installed, so detection only has to pick the right adapter:

```ts
{ id: "astro", label: "Astro", dir: "dist", toolchain: "js",
  adapter: { package: "@bunny.net/astro-adapter", add: "astro add @bunny.net/astro-adapter" } }
```

`add` runs the framework's own installer when there is one. Otherwise the CLI
installs the package and writes the configuration.

**`packages/config`, the `sites` block.** Add optional `adapter` and
`environment` keys, and keep `name`, `dir`, and `build`. `dir` and `build` stay
the override, and the manifest is the default.

**`sites/ci/workflow.ts`.** Emit `bunny deploy --preview pr-${{ github.event.number }}`
for a pull request, and `bunny deploy --prod` for a merge. Comment the preview
URL on the pull request. This needs `BunnyWay/actions/deploy-site` to accept a
preview name.

### Guard rails

- The CLI applies `requires.pullZone` and says what it did. `--no-settings`
  skips it.
- The bundle is checked against the 10 MB limit before the upload starts.
- A manifest version the CLI does not know stops the deploy, and names the
  version of the CLI to install.
- `--output json` prints the deploy ID, the URLs, the environment, and the
  release ID.

## Work in this repository

### 1. Write the build manifest

`packages/astro/src/build/deploy-manifest.ts`, called from `astro:build:done`.
It writes `.bunny/build.json` with the shape above. The values are already in
hand at that point: the bundle path and size, the client directory, and the
options the developer set.

The existing `dist/.bunny-adapter.json` stays. `astro preview` reads it, and it
is not the same file for the same job. Delete it only when preview reads the
new one.

`requires` follows the configuration:

- `pullZone.disableCookies: false` always. `Astro.cookies.set()` is broken
  without it, and nothing in a pull zone tells the developer why.
- `pullZone.enableSmartCache: false` when the project sets `routeRules`. Smart
  Cache does not cache HTML, so a rule does nothing while it is on.
- `storage.write: true` when sessions are on.
- `env` lists what cache purging needs.

### 2. Read the deploy prefix

`packages/astro/src/runtime/paths.ts` gains one resolver:

```ts
export function assetPrefix(): string {
  const injected = (globalThis as { __BUNNY_DEPLOY__?: { assetPrefix?: string } }).__BUNNY_DEPLOY__;
  return injected?.assetPrefix ?? Bunny.env.get("BUNNY_ASSET_PREFIX") ?? "";
}
```

Every storage read joins the prefix in front of the object path. That is
`runtime/storage.ts`, and the session driver. The prefix is empty for a
developer who deploys by hand today, so nothing breaks.

Sessions do **not** take the prefix. A session outlives a deploy, so it belongs
at `_bunny/sessions/`, outside the deploy tree.

Tests: a fixture that sets a prefix, and one that sets none, and a check in
each that the requests left for the prefixed path. `startLocalZone` records
every request, so the suite can prove where the script looked.

### 3. Serve assets through the pull zone, not through a password

This is the change that makes an Astro site the same shape as a static site.

Today the script fetches an asset from the Storage API, with a password, and
returns the bytes itself. That costs a subrequest against a budget of 50, and it
puts a password in the script.

A middleware script on a storage-backed pull zone does not need any of that. It
rewrites the path and returns the **request**, and the CDN reads the storage
origin itself, exactly as the static router does:

```ts
url.pathname = `/${assetPrefix()}${url.pathname}`;
return new Request(url, request);
```

What this wins:

- No storage password for assets. One less secret, and one less failure.
- No subrequest per asset. The budget goes back to the developer's code.
- Range requests, `304`s, and large objects are the CDN's job again.
- The same pull zone shape as a static site, so one CLI code path serves both.
- Bunny Optimizer reads a storage origin. It cannot read a script origin today.
  So this may also fix images. **Measure it. Do not claim it.** The Optimizer
  fix is in progress elsewhere, and this plan changes nothing about the image
  service.

What it costs:

- The script becomes a middleware script, not a standalone one. Astro's own
  routes still come from `onOriginRequest`, which may return a Response.
- Static page headers move to `onOriginResponse`, because the CDN now serves
  the page. Astro's `staticHeaders` feature keeps working, from the other hook.
- `astro preview` has to emulate the pass-through. `startLocalZone` already
  serves the objects, so the preview server follows the rewrite locally.
- A storage password is still needed for sessions, and only for sessions.

Do this before the CLI provisions a single framework site. Changing a pull
zone's origin type afterwards means a new script and a new zone, and a
migration nobody wants.

### 4. Take the command line out

`packages/astro/src/bin/cli.ts` does what `bunny deploy` will do, less well: it
has no deploys, no previews, no rollback, and it shells out to `bunny` anyway.

- Phase 3: `bunny-astro` prints a deprecation notice, and forwards to
  `bunny deploy` when `bunny` is on the path.
- Phase 4: delete it. The `bin` entry leaves `package.json`, in a major release.

`docs/writing-an-adapter.md` drops `bin/cli.ts` from the package layout, and
gains the manifest specification. An adapter ships no deploy tool.

### 5. The showcase and the tests

- `scripts/deploy-demo.mjs` calls `bunny deploy --prod`, and drops the
  environment variables it reads today.
- The end-to-end tier keeps running on Deno, against `startLocalZone`. It does
  not need the CLI.
- Add a fixture for the prefixed layout, under `tests/fixtures/deploy-prefix`.
- `test:live` keeps proving the real host, which is the only tier that can.

## Phases

Each phase is useful on its own, and each one ends with something to verify.

**Phase 1 — the contract.** The manifest, in both repositories. The adapter
writes it. The CLI reads it and prints what it found, behind
`bunny deploy --dry-run`. Nothing deploys differently.

**Phase 2 — pass-through assets.** Item 3 above, in the adapter. The showcase
runs on a middleware script. Measure the subrequest count, the cold start, and
whether Optimizer answers. This phase is inside this repository, and it is the
one with real risk.

**Phase 3 — `bunny deploy`.** Framework sites in the CLI: environments,
`requires`, the injected prefix, the stored bundle, promote and rollback. The
top-level command names. `bunny-astro` becomes a shim. The guide goes live with
this phase.

**Phase 4 — the rest of the loop.** `bunny ci init` for framework sites, the
action change, preview comments on pull requests, `bunny init astro`,
`bunny logs`. Delete `bunny-astro`.

## Risks and open questions

**A middleware script may not be able to do everything a standalone one does.**
Verify before phase 2 goes far: a Response returned from `onOriginRequest`,
`waitUntil`, the Cache API, and the cold-start budget. If any of it is worse,
phase 2 stops and phase 3 provisions standalone scripts with a storage
password. The rest of the plan does not change.

**Preview environments cost resources.** Each one is a pull zone and a script.
A repository with 20 open pull requests has 20 of each. Add a lifetime, and
delete an environment when its pull request closes. The action can do it.

**`BUNNY_API_KEY` for cache purging is account-wide.** Putting it in a script is
what the guide tells people to do today, and it is more access than the job
needs. Ask the platform for a token scoped to purging one pull zone. Until then
the CLI asks first, and never sets it without being asked.

**Logs are dashboard only.** `bunny logs` needs an API. Leave it out of the
guide until it exists.

**Two adapters are the real test.** The contract looks right with one adapter,
and one adapter always fits its own contract. Write the second adapter, or a
throwaway one, before calling `manifestVersion: 1` stable.

## How we know it worked

- A new Astro project reaches a live URL with one command, and one prompt.
- No guide asks a developer to type a password, or to write an API call.
- A deploy that changes nothing prints "no changes" and does nothing.
- A rollback is one command, and the page it restores has its own assets.
- The same commands deploy the static Astro fixture and the server one.
- `docs/writing-an-adapter.md` is enough to write the next adapter, with no
  change in the CLI.
