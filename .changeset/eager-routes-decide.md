---
"@bunny.net/astro-adapter": minor
---

Decide what to deploy from the routes, not from `output`.

The adapter used to read `config.output`. Since Astro 5 that setting is only a
default: `output: "static"` is what a project gets when it says nothing, and a
page leaves it with `export const prerender = false`. So a project that never
mentions `output` and has one dynamic route reported a build with no server. The
files went up, the dynamic routes did not, and nothing said so. Measured on
`withastro/astro.build`, which has nine such routes.

The adapter now counts the routes that render per request, and the build manifest
follows:

- Any route on demand: `kind: "ssr"`, and the script is deployed with the files.
- No route on demand: `kind: "static"`, and no script is named. `astro preview`
  still gets a bundle to run.

Astro injects `/_image` and `/_server-islands/[name]` into every project, so
neither counts. A project whose only on-demand work is a `server:defer` component
has to say `deploy: "server"`, which is the new option this adds.

A script above the 10 MB limit now fails the build, and says which packages
filled it. It used to log an error, finish with `Complete!` and exit 0, which let
`bunny deploy` get as far as creating a site before it stopped.

The warning that told you to set `output: "server"` is gone. It was wrong advice:
on `withastro/astro.build` that setting took the script from 7.83 MB to 22.30 MB,
and turned 4499 prerendered pages into pages that render per request.
