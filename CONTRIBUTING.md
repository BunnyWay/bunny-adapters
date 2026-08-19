# Contributing

Thank you for helping. This document tells you how to run the code, how to test
it, and how a change reaches npm.

## Setup

You need [Node](https://nodejs.org/) 20 or later and
[Deno](https://deno.com/) 2. Deno is the Edge Scripting runtime, so the tests use
it to run the real bundle.

```bash
git clone https://github.com/BunnyWay/bunny-adapters.git
cd bunny-adapters
npm install
npm run build
```

This is an npm workspaces monorepo. `npm install` at the root installs every
package, and links each example to the adapter beside it.

## Test tiers

Three tiers exist. The first two need no bunny.net account and no network.

| Command                        | What it does                                               |
| ------------------------------ | ---------------------------------------------------------- |
| `npm test`                     | Unit tests on the pure helpers. Fast.                      |
| `npm run test:e2e`             | Builds the showcase, runs it on Deno, asserts every route. |
| `node scripts/deploy-demo.mjs` | Deploys the showcase and asserts against the live URL.     |

The second tier is the important one. `tests/storage-emulator.mjs` answers like a
Bunny Storage zone over the local `dist/client` folder, so the suite covers
assets, prerendered pages and the 404 page without any cloud resource.

The third tier is manual, and it needs `BUNNY_API_KEY`. Continuous integration
never runs it, and no credential is stored in this repository.

## Add a test

`examples/astro-showcase` is both the demo and the fixture. To cover a new
capability:

1. Add a page to `examples/astro-showcase/src/pages/` that demonstrates it.
2. Add one entry to `examples/astro-showcase/e2e/checks.mjs`.

Both tiers pick it up. The demo and the test suite cannot drift apart, because
they are the same thing.

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
