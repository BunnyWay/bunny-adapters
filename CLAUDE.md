# bunny-adapters

Framework adapters for bunny.net Edge Scripting. npm workspaces monorepo.

## Layout

| Path                         | Holds                                                        |
| ---------------------------- | ------------------------------------------------------------ |
| `packages/astro`             | `@bunny.net/astro-adapter`, the only published package today |
| `examples/astro-showcase`    | The demo site. It is also the end-to-end fixture             |
| `tests/fixtures/*`           | One small Astro project per configuration                    |
| `tests/suites/*`             | The suite that asserts each fixture                          |
| `tests/`                     | The shared runner and harness                                |
| `docs/writing-an-adapter.md` | The contract every new adapter follows                       |
| `plans/`                     | Design documents for work that is not done yet. Often empty  |

The Bunny Storage emulator is `startLocalZone`, in
`packages/astro/src/build/local-zone.ts`. `astro preview` and every test tier
use it.

## Commands

```bash
npm install           # links every workspace
npm run build         # compiles each package
npm run check         # TypeScript, strict, no emit
npm test              # unit tests, node:test
npm run test:e2e      # builds the showcase, runs it on Deno, asserts each route
npm run test:fixtures # one project per configuration, each one run on Deno
npm run test:all      # the three tiers above, in order
npm run lint:package  # publint and attw on the built package
npm run format        # prettier
```

Everything but `test:live` needs Deno 2 on the PATH, and nothing but `test:live`
needs a bunny.net account.

## Rules

- **Test at the tier the behaviour belongs to.** A behaviour that depends on
  configuration needs a fixture under `tests/fixtures/`, with a suite beside it
  in `tests/suites/`. A behaviour that does not needs a page in
  `examples/astro-showcase/src/pages/` and a check in
  `examples/astro-showcase/e2e/checks.mjs`. A pure helper needs a unit test.
- **Prove where the script looked, not only what came back.** `startLocalZone`
  records every request, so a test can assert that nothing left the zone.
- **Deno is the runtime, not Node.** The server bundle is built with the `deno`
  export condition. Test the bundle on Deno, not on Node.
- **No secret at build time.** A storage password or an API key is read from the
  script environment at runtime. It never enters the bundle or the config.
- **Each adapter follows its own framework's code style, not ours.** Survey the
  framework's own adapters first, and record the answer in
  `docs/writing-an-adapter.md`. Only the platform rules in that document's
  "What every adapter shares" apply to all of them.
- **Every user-visible change needs a changeset.** Run `npm run changeset`.
- Keep the adapter's runtime code small. A script has 500 ms to start, and 10 MB.

## Deploy the demo

```bash
node scripts/deploy-demo.mjs           # uploads assets, deploys the script
node scripts/deploy-demo.mjs --verify  # then runs the checks against the live URL
```

It needs `bunny` on the PATH, and an authenticated profile.

## Documentation

The public guide lives in the separate `BunnyWay/documentation` repository, at
`scripting/frameworks/astro.mdx`. Update it in the same change, through a pull
request.
