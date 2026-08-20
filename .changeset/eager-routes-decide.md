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

The adapter now decides from the routes. The build manifest says `kind: "ssr"`
when a route renders per request, and the script is deployed with the files it
renders from.

A project whose only on-demand work is a `server:defer` component has to say
`deploy: "server"`, which is the new option this adds. Astro reports such a
project as a fully prerendered one, so nothing in the routes can tell it apart.

A script above the 10 MB limit now fails the build, and says which packages
filled it. A script above 7.5 MB gets a warning, because the documented 10 MB is
not the size that works: measured in August 2026, the same code served every
request at 7.44 MB and answered 400 with an empty body at 7.83 MB. The inlined
asset manifest is capped at 5000 files for the same reason; 8824 of them cost
410 kB of a budget that turns out to be about 7.5 MB. It used to log an error, finish with `Complete!` and exit 0, which let
`bunny deploy` get as far as creating a site before it stopped.

A build with no route on demand now says how many images it copied without
transforming, and that `imageService: false` would have `sharp` resize them while
the site builds. `noop` is the default because transforming on demand needs
`sharp`, and the edge cannot run it; a site with nothing on demand never asks.
`withastro/astro.build` uploaded 1.3 GB of untransformed images.

The warning that told you to set `output: "server"` is gone. It was wrong advice:
on `withastro/astro.build` that setting took the script from 7.83 MB to 22.30 MB,
and turned 4499 prerendered pages into pages that render per request.
