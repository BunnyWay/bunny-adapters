# bunny-adapters

Framework adapters for bunny.net Edge Scripting. npm workspaces monorepo.

## Layout

| Path                         | Holds                                                        |
| ---------------------------- | ------------------------------------------------------------ |
| `packages/astro`             | `@bunny.net/astro-adapter`, the only published package today |
| `examples/astro-showcase`    | The demo site. It is also the end-to-end fixture             |
| `tests/`                     | The end-to-end runner and the Bunny Storage emulator         |
| `docs/writing-an-adapter.md` | The contract every new adapter follows                       |
| `plans/`                     | Design documents for work that is not done yet               |

## Commands

```bash
npm install          # links every workspace
npm run build        # compiles each package
npm run check        # TypeScript, strict, no emit
npm test             # unit tests, node:test
npm run test:e2e     # builds the showcase, runs it on Deno, asserts each route
npm run lint:package # publint and attw on the built package
npm run format       # prettier
```

`npm run test:e2e` needs Deno 2 on the PATH. It needs no bunny.net account,
because `tests/storage-emulator.mjs` answers like a storage zone.

## Rules

- **The showcase is the test suite.** A new capability needs a page in
  `examples/astro-showcase/src/pages/` and a check in
  `examples/astro-showcase/e2e/checks.mjs`. Never add a separate fixture.
- **Deno is the runtime, not Node.** The server bundle is built with the `deno`
  export condition. Test the bundle on Deno, not on Node.
- **No secret at build time.** A storage password or an API key is read from the
  script environment at runtime. It never enters the bundle or the config.
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
