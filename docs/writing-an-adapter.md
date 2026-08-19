# Writing an adapter

This repository holds one adapter per framework. This document records what they
share, so the next one is quick to write and quick to review.

## What an adapter does

Edge Scripting runs one JavaScript file on the bunny.net network. It has no disk,
and it holds no build output. So every adapter here does three things:

1. **Bundle.** Take the framework's server build, and produce one file under
   10 MB that starts in under 500 ms.
2. **Serve.** Answer each request with the framework's own request handler.
3. **Delegate.** Read hashed assets and prerendered pages from Bunny Storage,
   because they cannot live in the script.

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
| CLI       | `bunny-<framework>`              | `bunny-astro`              |
| Example   | `examples/<framework>-showcase`  | `examples/astro-showcase`  |

## Package layout

```
packages/<framework>/
├─ src/
│  ├─ index.ts        the build-time plugin or integration
│  ├─ server.ts       the runtime entry, which runs inside the script
│  ├─ types.ts        the public option types
│  └─ bin/cli.ts      upload and deploy
├─ test/*.test.ts     unit tests on the pure helpers, node:test
├─ package.json
├─ tsconfig.json
├─ README.md
└─ LICENSE            MIT, one copy per package
```

Keep `src/server.ts` free of Node built-ins that Deno does not provide. Keep it
small; it counts against the start-up budget.

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

## Configuration

| Variable             | Meaning                                |
| -------------------- | -------------------------------------- |
| `BUNNY_STORAGE_ZONE` | The zone that holds the client build   |
| `BUNNY_STORAGE_HOST` | That zone's regional endpoint          |
| `BUNNY_STORAGE_KEY`  | That zone's read-only password         |
| `BUNNY_API_KEY`      | Only when the adapter purges the cache |
| `BUNNY_PULLZONE_ID`  | Only when the adapter purges the cache |

Use the same names in every adapter. A user who moves between frameworks must
not have to learn a second set.

## Tests

Every adapter has an example site in `examples/`, and that site is the fixture.

- Each capability gets one page and one check.
- `tests/e2e.mjs` builds the example, starts `tests/storage-emulator.mjs` over
  its client output, runs the bundle on Deno, and runs the checks.
- The runner is shared. A new adapter supplies a `checks.mjs` and a build
  command, and gets the whole harness.

Unit tests cover the pure helpers only: path handling, content types, option
resolution, URL building. Anything that needs a network belongs in the
end-to-end tier.

## Release

Changesets. Add one with the change, and the merge to `main` publishes it.
