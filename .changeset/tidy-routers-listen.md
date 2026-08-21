---
"@bunny.net/astro-adapter": minor
---

Deploy no script when every route is prerendered.

The adapter now takes `buildOutput` from Astro, which is the only thing that
knows whether a route renders per request, and hands the answer back. A static
build produces no server entry, no bundle, and a manifest that names no script:
`bunny sites deploy` uploads `dist/client`, and the `bunny sites` router serves
it.

A 404 page, a redirect, or a header no longer pulls the whole Astro server along.
The router answers a miss with your `404.html`, and the build writes `_redirects`
and `_headers` beside the pages, which is what Cloudflare Pages and Netlify read
too. `astro preview` uses Astro's own static server for such a build, so it needs
no Deno.

A prerendered page holding a `server:defer` island still needs the script, and
Astro reports that project as a static build. Pass `deploy: "server"` for it.
