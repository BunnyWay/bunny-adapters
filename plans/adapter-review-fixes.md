# Close the findings from the adapter code review

A review of the whole repository found twelve defects. This plan fixes eleven of
them. It leaves one out, because the team already knows about it.

Every defect below was reproduced against the built bundle on Deno, or against
the built CLI. None of them was found by reading alone.

## What stays out

The showcase sets `imageService: "bunny"`, and the adapter warns against that
value. Bunny Optimizer cannot read from an Edge Script yet. The team fixes
Optimizer later, so the showcase keeps the setting for now.

The session driver maps every unsafe character in a session id to `_`. Two
different ids could therefore share one object. Astro generates a UUID for every
session, so no real id reaches that path. This stays as it is.

## 1. A request reads outside the storage zone

`toObjectPath` decodes the request path once. It then drops every `..` segment.
The result goes into a `fetch` URL without encoding. The URL parser decodes a
second time. It reads `%2e%2e` as a traversal segment, and it reads `\` as a
separator.

Three shapes leave the zone today:

| Request                                | URL the script asks for   |
| -------------------------------------- | ------------------------- |
| `/%252e%252e/other-zone/secret.json`   | `/other-zone/secret.json` |
| `/a/%252e%252e/%252e%252e/other-zone/` | `/other-zone/`            |
| `/..%5c..%5cother-zone/secret.json`    | `/other-zone/secret.json` |

The zone password travels with each one. A fourth shape injects a query string:
`/asset%3Fdownload=1` becomes `/my-zone/asset?download=1`.

This is reachable only when the build inlines no file list. That happens with
`assetManifest: false`, or above 20 000 client files.

**Fix.** Decode exactly once, then treat the result as literal text. Encode each
segment again when the script builds the Storage URL. Add `encodeObjectPath` to
`runtime/paths.ts`, and use it in `runtime/storage.ts` and in the CLI.

Also split a request path on `\` as well as on `/`. An object path then never
holds a backslash.

**Test.** The local zone records every path it receives. The `no-manifest` suite
sends all four shapes, and asserts that no request leaves the zone prefix.

## 2. Preview writes sessions into the folder you publish

`preview.ts` gives the script one local zone for assets and for sessions. That
zone serves `dist/client`. A session write therefore creates
`dist/client/_sessions/<id>.json`.

`bunny-astro upload` sends `dist/client` to the public asset zone. A developer
who previews and then deploys publishes their local sessions. The script serves
them with `public, max-age=31536000, immutable`.

**Fix.** Start a second local zone for sessions, over `dist/.preview-sessions`.
That folder sits outside `dist/client`, so no upload reaches it. Make the same
change in `tests/harness.mjs` and `tests/e2e.mjs`.

**Test.** `tests/e2e.mjs` asserts that `dist/client` holds no `_sessions` folder
after the session check runs.

## 3. A bad `--concurrency` uploads nothing and reports success

`parseArgs` calls `Number()` on the flag and checks nothing. `pool()` then builds
an empty worker list from `NaN` or from `0`. The command prints
`Upload complete.` and exits 0.

`deploy` uploads first and deploys second. A typo therefore ships a new script
against the previous build's assets.

**Fix.** Refuse a value that is not a whole number of 1 or more.

**Test.** A new `tests/suites/cli.test.mjs` runs the built CLI against a writable
local zone. It proves that a good run uploads every file, and that a bad
`--concurrency` exits non-zero and uploads nothing.

## 4. The build deletes the bundle it just reported

`astro:build:done` removes the server folder after it bundles. Nothing checks
where `outfile` points. A project that writes the bundle into `build.server`
gets a success message and no file.

**Fix.** Keep the folder when the bundle sits inside it, and warn.

**Test.** A new `outfile-nested` fixture. The suite asserts that the bundle
survives, and that the log explains why the folder stayed.

## 5. Every method serves a stored object

`fromStorage` looks at the method only to drop the body for `HEAD`. A `DELETE`
therefore answers 200 with the whole file.

**Fix.** Answer 405 with `Allow: GET, HEAD`, but only once the object is known to
exist. A `POST` to a path the build never produced must still reach Astro's 404
page.

**Test.** The `ranges` suite covers each method against a stored file. The
`errors` suite covers a `POST` to an unknown path.

## 6. `maxWidth` guards width only

`validateOptions` clamps `width` and `widths`. It leaves `height` alone, and the
`fit: "cover"` crop box uses that height. `quality` gets no range check, though
the option type promises 1 to 100.

**Fix.** Clamp `height` with the same limit. Clamp every quality to 1 to 100.

**Test.** Unit tests for each shape.

## 7. A wrong password 404s the whole site, silently

`storage.get` turns every status but 200, 304 and 416 into a miss. A 401 is
therefore indistinguishable from a missing object, and nothing reaches the log.

**Fix.** Write one line to the error log on a 401 or a 403, and then behave as
before. Write it once per isolate, so a broken zone does not flood the log.

## 8. Release publishes without a test gate

`release.yml` runs `npm ci` and `npm run build`, and then publishes. It does not
depend on the CI workflow, and it runs no test of its own.

**Fix.** Run `npm run test:all` in the release job, with Deno on the path.

## 9. Two documents contradict the adapter contract

`docs/writing-an-adapter.md` is current. `CONTRIBUTING.md` and `CLAUDE.md` are
not. Both say three test tiers, and there are four. Both name
`tests/storage-emulator.mjs`, which does not exist. `CLAUDE.md` says never to add
a fixture, and the repository holds fifteen.

**Fix.** Bring both documents to what the repository does.

## 10. Dead source maps ship in the package

`tsconfig.json` emits a source map beside every file. `package.json` ships
`dist` and not `src`. Every published map therefore points at a file the package
does not hold.

**Fix.** Turn on `inlineSources`, so each map carries its own source.

## 11. Node 20 is promised but never tested

Both `package.json` files ask for Node 20 or later. CI pins Node 22, and runs no
matrix.

**Fix.** Run the check job on Node 20 and on Node 22.

## Smaller items

- `tests/live.mjs` holds raw escape bytes in its colour constants. Every other
  script writes `\u001b`.
- `cache.ts` builds a `TextEncoder` inside a loop.
- An empty `PORT` makes the script listen on a random port, not on 8080.
- The README omits `--concurrency` and `--outfile` from the command list.
- One README blockquote line lost its `>`.
- `docs/writing-an-adapter.md` names the unit tests `test/*.test.ts`. They are
  `.mjs`.

## How to check the work

```bash
npm run build
npm run check
npm run format:check
npm run test:all
npm run lint:package
```

`test:all` needs Deno 2. It needs no bunny.net account.
