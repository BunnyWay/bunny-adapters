# Writing an adapter

This repository holds one adapter per framework. This document records what they
share, so the next one is quick to write and quick to review.

## What an adapter does

Edge Scripting runs one JavaScript file on the bunny.net network. It has no disk,
and it holds no build output. So every adapter here does four things:

1. **Bundle.** Take the framework's server build, and produce one file under
   10 MB that starts in under 500 ms.
2. **Serve.** Answer each request with the framework's own request handler.
3. **Delegate.** Read hashed assets and prerendered pages from Bunny Storage,
   because they cannot live in the script.
4. **Declare.** Write a [build manifest](#the-build-manifest), so `bunny deploy`
   can deploy the result without knowing anything about the framework.

```
browser ──▶ pull zone ──▶ Edge Script (the framework's handler)
                              │
                              └─ assets and prerendered pages ─▶ Bunny Storage
```

## Naming

| Thing     | Rule                             | Example                    |
| --------- | -------------------------------- | -------------------------- |
| Directory | `packages/<framework>`           | `packages/astro`           |
| Package   | `@bunny.net/<framework>-adapter` | `@bunny.net/astro-adapter` |
| Example   | `examples/<framework>-showcase`  | `examples/astro-showcase`  |

An adapter ships no deploy command of its own. `bunny deploy` deploys every
adapter, and the package name above is what the CLI's framework detection looks
for.

## Package layout

```
packages/<framework>/
├─ src/
│  ├─ index.ts                 the build-time plugin or integration
│  ├─ server.ts                the runtime entry, which runs inside the script
│  ├─ types.ts                 the public option types
│  ├─ build/deploy-manifest.ts writes `.bunny/build.json`
│  └─ runtime/deploy.ts        reads which deploy this script is
├─ test/*.test.mjs    unit tests on the pure helpers, node:test
├─ package.json
├─ tsconfig.json
├─ README.md
└─ LICENSE            MIT, one copy per package
```

Keep `src/server.ts` small. It counts against the 500 ms start-up budget.

Most `node:` built-ins are available, including `node:fs` over a virtual file
system. That file system is per isolate and lives in memory, so it is a scratch
pad and never a store. Persistent state belongs in Bunny Storage.

## The build contract

- Bundle with esbuild, `platform: "neutral"`, `format: "esm"`.
- Use the conditions `["deno", "worker", "import", "module", "default"]`. The
  `deno` condition is what picks the correct `@bunny.net/edgescript-sdk` build.
- Mark `node:*` external. The runtime provides those.
- Write one file, and report its size against the 10 MB limit.
- Delete the framework's intermediate server folder afterwards.

## The runtime contract

- Serve with `BunnySDK.net.http.serve(handler)`.
- Read the client IP from `x-forwarded-for`.
- Read the country from `cdn-requestcountrycode`, and the request id from
  `cdn-requestid`.
- Pass `Bunny.v1.waitUntil` to the framework when it accepts one.
- Read every secret from the environment, never from the bundle.

## The build manifest

The CLI knows no framework. At the end of the build, write
`.bunny/build.json` at the project root, and `bunny deploy` knows what to do
with the result. A new adapter needs no new CLI release.

```jsonc
{
  // Bump only for a change an older CLI cannot read. A new optional field is
  // not one: the CLI ignores what it does not know.
  "manifestVersion": 1,

  "adapter": { "package": "@bunny.net/astro-adapter", "version": "0.1.0" },
  "framework": { "name": "astro", "version": "7.2.4" },

  // "ssr" needs a script. "static" is files only, and deploys as a static site.
  "kind": "ssr",

  "script": {
    "entry": "dist/index.js", // one file, 10 MB at most
    "type": "standalone",
    "bytes": 668140,
  },

  "assets": { "dir": "dist/client" },

  // What the CLI has to arrange before the site works. It applies each one,
  // reports every change, and never changes one back in silence.
  "requires": {
    "cliVersion": ">=1.2.3", // optional floor; omit unless a release must be ruled out
    "pullZone": { "disableCookies": false, "enableSmartCache": false },
    "storage": { "write": true, "reason": "sessions" },
    "env": [
      { "name": "BUNNY_STORAGE_ZONE", "reason": "the zone holding the client build" },
      { "name": "BUNNY_STORAGE_KEY", "reason": "that zone's read-only password", "secret": true },
      { "name": "BUNNY_API_KEY", "reason": "cache purging", "secret": true, "optional": true },
    ],
  },

  "dev": { "command": "astro dev", "preview": "astro preview" },
}
```

Rules:

- Paths are relative to the project root, and use forward slashes.
- The file is a build output. `.gitignore` covers it.
- The CLI validates it against `BuildManifestSchema` in `@bunny.net/config`. A
  shape it cannot read stops the deploy: half a deployed site is worse than none.
- Ask for everything in `requires`. A setting the CLI does not apply becomes a
  support ticket that reads "the site looks broken".

### Which deploy this script is

`bunny deploy` puts each build in its own folder in the zone, and writes the
folder's name into the top of the bundle:

```js
globalThis.__BUNNY_DEPLOY__ = {
  id: "a1b2c3d4",
  assetPrefix: "deploys/a1b2c3d4",
  site: "my-site",
  environment: "production",
};
```

Read it, and join `assetPrefix` in front of every object path. The code and the
files it was built against then cannot drift apart, and publishing an earlier
release restores that release's files in the same operation. Fall back to
`BUNNY_ASSET_PREFIX`, and then to the zone root, so a deploy that does not go
through the CLI still works. Sessions do **not** take the prefix: a session
outlives a deploy.

## Configuration

| Variable             | Meaning                                           |
| -------------------- | ------------------------------------------------- |
| `BUNNY_STORAGE_ZONE` | The zone that holds the client build              |
| `BUNNY_STORAGE_HOST` | That zone's regional endpoint                     |
| `BUNNY_STORAGE_KEY`  | That zone's read-only password                    |
| `BUNNY_ASSET_PREFIX` | The folder inside the zone that holds this deploy |
| `BUNNY_API_KEY`      | Only when the adapter purges the cache            |
| `BUNNY_PULLZONE_ID`  | Only when the adapter purges the cache            |

Use the same names in every adapter. A user who moves between frameworks must
not have to learn a second set.

## Tests

There are four tiers. Each one answers a question the tier below it cannot.

**Unit tests** (`packages/<framework>/test/*.test.mjs`) cover the pure helpers
only: path handling, content types, option resolution, URL building. Anything
that needs a network belongs higher up.

**The showcase** (`examples/<framework>-showcase`) is one site that uses every
capability, and `tests/e2e.mjs` proves it. Each capability gets one page and one
check, so the demo and the suite cannot drift apart. It builds the example,
serves its client output from `startLocalZone`, runs the bundle on Deno, and
runs the checks.

**Fixtures** (`tests/fixtures/<name>`, asserted by `tests/suites/*.test.mjs`)
are one small project per configuration. The showcase proves one configuration
very well, and a real project changes the configuration: it sets a base path, it
adds redirects, it turns an option off. Each fixture is a whole Astro project,
and `serveFixture` in `tests/harness.mjs` builds it and runs it on Deno behind
the same local zone. A fixture needs no install of its own, because Node walks
up to the repository's `node_modules`.

Write a fixture whenever a behaviour depends on configuration. Write a showcase
page when it does not.

**The live tier** (`tests/live.mjs`) is the only one that can prove a pull zone
feature, and it is the only one that needs a credential. It runs by hand, never
in continuous integration. When it changes a paid setting, it reads the setting
first and puts it back at the end, including on Ctrl-C.

The runner is shared across all four. A new adapter supplies a `checks.mjs` and
a build command, and gets the whole harness.

## Release

Changesets. Add one with the change, and the merge to `main` publishes it.
