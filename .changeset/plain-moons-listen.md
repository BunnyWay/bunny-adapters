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

Serve a stored object in pieces. The script now passes `Range`, `If-Range`,
`If-None-Match`, and `If-Modified-Since` through to Bunny Storage, which answers
all four, and it says `Accept-Ranges: bytes` on every object it serves.

That header is what a pull zone needs. Without it the pull zone answers a range
request with the whole object, from its cache as well as from the origin, so a
large file is only seekable once it is fully downloaded. A conditional request
now costs a `304` instead of the whole object.
