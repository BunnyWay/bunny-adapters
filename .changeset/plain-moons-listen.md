---
"@bunny.net/astro-adapter": patch
---

Stop a pull zone caching a 500. Astro reuses the headers of the prerendered
error page on the response the visitor gets, so a transient failure was cached
and handed to everybody who asked for that path. A 404 keeps the page lifetime,
because a missing path stays missing until the next deploy.

Say plainly that Bunny Optimizer cannot read from an Edge Script yet. With
Optimizer on, an image request that misses the CDN cache answers `523 Origin
Connection Failed`. `imageService: "bunny"` writes the right URLs, and nothing
serves them, so the build now warns and the README says so.
