---
"@bunny.net/astro-adapter": patch
---

Stop a pull zone caching a 500. Astro reuses the headers of the prerendered
error page on the response the visitor gets, so a transient failure was cached
and handed to everybody who asked for that path. A 404 keeps the page lifetime,
because a missing path stays missing until the next deploy.
