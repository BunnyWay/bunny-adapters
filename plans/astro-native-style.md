# Make the Astro adapter read like an Astro adapter

The August 2026 survey compared `packages/astro` with the four official
adapters: `@astrojs/node`, `@astrojs/cloudflare`, `@astrojs/netlify`, and
`@astrojs/vercel`. They live in `withastro/astro`, under
`packages/integrations/`. `docs/writing-an-adapter.md` holds the result.

The survey found good news and bad news. The shape of the code is already
right: functions, factories, and plain data, exactly as the four do. Four
differences remain, and two of them a reader notices at once.

Worse, nothing holds the style in place. It arrived by luck, and a single
merge can undo it without one reviewer noticing. So this plan closes the gaps
that matter, and then adds the check that keeps them closed.

| Difference                                  | This plan                |
| ------------------------------------------- | ------------------------ |
| Prettier, spaces, double quotes             | Stage 2                  |
| Plain `Error` for a build failure           | Stage 1                  |
| `define` instead of a virtual config module | No. See the last section |
| Comments on 35% of lines                    | No. Keep them            |

## Stage 1 — `AstroError` for a failure the user must fix

Three of the four official adapters throw `AstroError` from `astro/errors` when
a build cannot continue. Astro then prints the message in its own error box,
and it prints a hint under it. We throw a plain `Error`, so our size-limit
failure arrives as a bare stack trace.

The API is a two-argument constructor, verified against astro 7.2.3:

```ts
import { AstroError } from "astro/errors";

throw new AstroError(
  `${relative} is ${formatSize(bytes)}, and Edge Scripting takes ${formatSize(SIZE_LIMIT)}.\n\n${largestList(largest)}`,
  "Prerender the routes that do not need a server with `export const prerender = true`. " +
    "A package that only runs at build time does not belong in the server.",
);
```

That split is the whole point. The message says what happened, and the hint
says what to do. Today both halves sit in one string.

Change these throws:

| File             | Throw                            |
| ---------------- | -------------------------------- |
| `src/index.ts`   | the script is above `SIZE_LIMIT` |
| `src/preview.ts` | all four                         |

Leave these alone, and say why in a comment at the first one:

| File                             | Why                                                               |
| -------------------------------- | ----------------------------------------------------------------- |
| `src/runtime/storage.ts`         | The bundle reaches it. `astro/errors` must never enter the script |
| `src/session.ts`, `src/cache.ts` | The same                                                          |
| `src/server.ts`                  | The same                                                          |
| `src/build/local-zone.ts`        | An internal invariant, and no user can fix it                     |

Move the size-limit message into a pure function in `src/build/bundle.ts`, and
unit test it. The condition needs a bundle above 10 MB, and no fixture should carry one. So the message is the part a test can reach.

## Stage 2 — tabs and single quotes in `packages/astro`

Astro formats every adapter with Biome: tabs, single quotes, 100 columns. We
use Prettier with spaces and double quotes. This is the difference a contributor
sees on line one of every file.

Do not add Biome. A second formatter costs a second config and a second tool in CI. Prettier can already imitate the result. Add an override
instead:

```jsonc
// .prettierrc.json
{
  "printWidth": 100,
  "singleQuote": false,
  "trailingComma": "all",
  "overrides": [
    {
      // Astro formats every official adapter with Biome: tabs, single quotes.
      // A contributor reads `@astrojs/cloudflare` before this package, so the
      // package matches it. Prettier does not copy Biome's wrapping exactly,
      // and the two things a reader sees first are the indent and the quotes.
      "files": "packages/astro/**/*.{ts,mjs}",
      "options": { "useTabs": true, "singleQuote": true },
    },
  ],
}
```

Then reformat in **one commit that changes nothing else**, and keep `git blame`
readable:

```bash
npm run format
git commit -am "Format packages/astro the way Astro formats its adapters"
echo "<that commit sha>" >> .git-blame-ignore-revs
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

GitHub reads `.git-blame-ignore-revs` too, so the reformat disappears from blame
on both sides. Add the `blame.ignoreRevsFile` line to the repository setup notes
in `CLAUDE.md`, because a clone does not inherit git config.

CI already runs `npm run format:check`, so this stage needs no new check. It
holds itself from the moment it lands.

## Stage 3 — the check that makes the style persist

Formatting is now automatic, and everything else in the style is prose. Prose
does not survive twenty merges. So add `scripts/check-style.mjs`, one script
with a table of named rules, and wire it in:

```jsonc
// package.json
"check:style": "node scripts/check-style.mjs"
```

Add it to `.github/workflows/ci.yml`, next to `npm run check`. A rule that only
runs by hand is a rule that does not run.

Every rule prints what it found, why the rule exists, and which section of
`docs/writing-an-adapter.md` states it. A check that only prints "failed"
teaches nobody.

Rules that apply to every package, because Edge Scripting forces them:

| Rule                                                                          | Why it can break silently                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| No `process.env` or `Deno.env` outside the one `env()` helper                 | It works on Deno and fails on the edge, or the other way round                              |
| Nothing under `src/runtime/`, and no runtime entry, imports from `src/build/` | `build/bundle.ts` pulls in esbuild, so one import puts esbuild in the script                |
| No `any`, and no `!` non-null assertion, anywhere in `src/`                   | Both are absent today, and each one arrives one merge at a time                             |
| A module the bundle reaches imports nothing from a deny-list                  | Stage 1 adds `astro/errors` to that list. The list is where a build-only import gets caught |

Rules that come from the framework, and that differ per package:

| Rule for `packages/astro`                          | The framework's reason                                  |
| -------------------------------------------------- | ------------------------------------------------------- |
| No `class` in `src/`                               | One class in about 6,700 lines of official adapter code |
| Every relative import ends in `.js`                | Every official adapter does this                        |
| No `throw new Error` in `index.ts` or `preview.ts` | A build failure is an `AstroError`, from stage 1        |

Key the per-package rules by directory in one table at the top of the script.
Adding Nuxt then means adding one row, and a Nitro preset needs the opposite
extension rule: `.ts`, not `.js`. The script must not assume one answer.

## Stage 4 — keep the survey from going stale

A framework's own style moves. `vite-plugin-config.ts` is recent, and the
`withastro/adapters` repository is already archived. So the survey needs a
trigger, not good intentions.

The trigger is the peer range. Raise `astro` to a new major, and re-run the
survey in the same change. Update the Astro table in
`docs/writing-an-adapter.md` with what it finds. A new major is when an adapter's idiom moves, and
it is a change nobody makes by accident.

Add that sentence to the rules in `CLAUDE.md`.

## What this plan does not do, and why

- **The virtual config module.** Three of the four adapters now inject runtime
  config through a `vite-plugin-config.ts` virtual module. We use
  `vite.define` and `__BUNNY_ADAPTER_OPTIONS__`. No user sees the difference. It touches the build and the runtime together, and the esbuild manifest define stays either way. Do it when we next change the options plumbing, and
  not for its own sake.
- **Renaming `BunnyAdapterOptions`.** Astro splits `UserOptions` from a
  resolved `Options`. Our `RuntimeOptions` already is the resolved half, and
  `BunnyAdapterOptions` is exported API. A rename breaks an import and buys a
  user nothing.
- **Splitting `cache.ts` into `cache/provider.ts`.** One provider, one file.
  Split it when a second file exists.
- **Cutting the comments back to Astro's 14% to 21%.** Ours sit at 35%, and
  they hold measured limits of a platform that documents none of them. The
  deviation is recorded, and it stays.

## Verification

| Step                                     | Proves                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `npm run format:check` on a clean tree   | Stage 2 landed, and CI keeps it                                        |
| `git blame packages/astro/src/server.ts` | The reformat does not hide the real authors                            |
| `npm run check:style` on the clean tree  | Every rule passes as written                                           |
| Break each rule by hand, run it, revert  | Every rule actually fires. A check nobody has seen fail is not a check |
| `npm run test:all`                       | The reformat and the error change break no behaviour                   |
| One build over the size limit, by hand   | The `AstroError` renders with its hint                                 |

## Open questions

- Does Prettier with tabs and single quotes look close enough to Biome? If a
  contributor still reads the wrapping as foreign, Biome for that one package
  becomes the answer, and the override becomes dead weight.
- The rule tables live in the script and in the document. Two copies can
  disagree. A machine-readable file that both read is the fix, and it is not
  worth building for one adapter. Revisit when the second adapter lands.
