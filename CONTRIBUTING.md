# Contributing

Thank you for helping. This document tells you how to run the code, how to test
it, and how a change reaches npm.

## Setup

You need [Node](https://nodejs.org/) 22.12 or later and
[Deno](https://deno.com/) 2. Deno is the Edge Scripting runtime, so the tests use
it to run the real bundle.

```bash
git clone https://github.com/BunnyWay/bunny-adapters.git
cd bunny-adapters
npm install
npm run build
```

Astro 7 sets that floor, and the adapter has Astro as a peer dependency.
Continuous integration runs the checks on Node 22 and on Node 24.

This is an npm workspaces monorepo. `npm install` at the root installs every
package, and links each example to the adapter beside it.

## Test tiers

Four tiers exist. The first three need no bunny.net account and no network.
`npm run test:all` runs those three.

| Command                 | What it does                                               |
| ----------------------- | ---------------------------------------------------------- |
| `npm test`              | Unit tests on the pure helpers. Fast.                      |
| `npm run test:e2e`      | Builds the showcase, runs it on Deno, asserts every route. |
| `npm run test:fixtures` | One small project per configuration, each one run on Deno. |
| `npm run test:live`     | Runs the checks against a real deployment. By hand only.   |

`startLocalZone`, in `packages/astro/src/build/local-zone.ts`, answers like a
Bunny Storage zone over a local folder. Tiers two and three both use it, so they
cover assets, prerendered pages, ranges and the 404 page with no cloud resource.
It records every path it is asked for, so a test can prove where the script
looked and not only what came back.

The fourth tier needs a credential, and it is the only tier that can prove a
pull zone feature. Continuous integration never runs it. This repository stores
no credential.

[docs/writing-an-adapter.md](./docs/writing-an-adapter.md) says what question
each tier answers.

## Add a test

Which tier depends on what the behaviour depends on.

**A behaviour that changes with configuration** needs a fixture. Add a small
Astro project under `tests/fixtures/<name>`, and a suite at
`tests/suites/<name>.test.mjs`. `serveFixture` in `tests/harness.mjs` builds it
and runs it on Deno behind the local zone. A fixture needs no install of its
own, because Node walks up to this repository's `node_modules`.

**A behaviour that does not** goes in the showcase:

1. Add a page to `examples/astro-showcase/src/pages/` that demonstrates it.
2. Add one entry to `examples/astro-showcase/e2e/checks.mjs`.

The showcase is the demo and the end-to-end fixture, so those two cannot drift
apart.

**A pure helper** gets a unit test in `packages/<framework>/test/*.test.mjs`.
Anything that needs a network belongs higher up.

## Add an adapter

Read [docs/writing-an-adapter.md](./docs/writing-an-adapter.md). It records the
package layout, the naming rule, and the contract each adapter meets.

## Commit and release

Write commit messages in the imperative mood. Say why the change is needed, not
only what it changes.

Releases use [changesets](https://github.com/changesets/changesets). Add one with
your change:

```bash
npm run changeset
```

Choose the package, choose patch, minor or major, and describe the change for the
changelog. When the pull request merges, a release pull request appears. Merging
that one publishes to npm.

## Code style

- Prettier formats everything. Run `npm run format` before you push.
- TypeScript runs in strict mode. `npm run check` must pass.
- `npm run lint:package` runs `publint` and `attw` on the built package. Both
  must be clean, because a broken `exports` map breaks every consumer.
- Comment why, not what.
