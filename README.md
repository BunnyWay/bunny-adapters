<div align="center">

# bunny.net adapters

**Deploy your favourite web framework to [bunny.net Edge Scripting](https://bunny.net/docs/scripting).**

[![CI](https://github.com/BunnyWay/bunny-adapters/actions/workflows/ci.yml/badge.svg)](https://github.com/BunnyWay/bunny-adapters/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40bunny.net%2Fastro-adapter?label=%40bunny.net%2Fastro-adapter)](https://www.npmjs.com/package/@bunny.net/astro-adapter)
[![licence](https://img.shields.io/badge/licence-MIT-blue)](./LICENSE)

</div>

Edge Scripting runs JavaScript on the bunny.net network, next to your visitors.
An adapter in this repository builds your framework's server into one file that
Edge Scripting accepts, and serves the build assets from
[Bunny Storage](https://bunny.net/docs/storage).

```
browser ──▶ pull zone ──▶ Edge Script (your framework, server-side)
                              │
                              └─ assets and prerendered pages ─▶ Bunny Storage
```

## Adapters

| Framework                     | Package                                        | Status    | Guide                                                     |
| ----------------------------- | ---------------------------------------------- | --------- | --------------------------------------------------------- |
| [Astro](https://astro.build/) | [`@bunny.net/astro-adapter`](./packages/astro) | Available | [Docs](https://bunny.net/docs/scripting/frameworks/astro) |
| SvelteKit                     | `@bunny.net/svelte-adapter`                    | Planned   | —                                                         |
| Next.js (OpenNext)            | `@bunny.net/opennext-adapter`                  | Planned   | —                                                         |

Do you want another framework? [Open an
issue](https://github.com/BunnyWay/bunny-adapters/issues/new/choose) and tell us.

## Quick start

```bash
npx astro add @bunny.net/astro-adapter   # add the adapter
npm run build                            # build the edge bundle
bunny sites deploy                       # upload the files, publish the script
```

The [Astro adapter README](./packages/astro/README.md) has the whole story.

## Examples

[`examples/astro-showcase`](./examples/astro-showcase) is a live Astro site. Every
page demonstrates one adapter capability, and every page is also a test. Read it
to see how a feature works, and copy what you need.

```bash
npm install
npm run --workspace examples/astro-showcase dev
```

## Repository layout

| Path         | Holds                                                 |
| ------------ | ----------------------------------------------------- |
| `packages/*` | One published adapter each                            |
| `examples/*` | Runnable demo sites, which the test suite drives      |
| `tests/`     | The shared end-to-end runner and the Storage emulator |
| `docs/`      | How to write and release an adapter                   |
| `plans/`     | Design documents for work that is not done yet        |

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md). It covers the local setup, the three
test tiers, and how a change reaches npm.

```bash
npm install
npm test          # unit tests
npm run test:e2e  # build the showcase and run it on Deno, offline
```

## Licence

[MIT](./LICENSE) © bunny.net
