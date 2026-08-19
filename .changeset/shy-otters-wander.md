---
"@bunny.net/astro-adapter": patch
---

Serve a site that sets `base`. Astro writes the client build without the `base`
prefix, and the browser asks with it. The script now removes the prefix before
it reads Bunny Storage, so assets and prerendered pages under a base path no
longer answer 404.

Answer a configured redirect with its own status. Astro turns an internal
redirect to a prerendered page into a page that carries a `Location` header,
and the script served that page as 200. A browser ignores `Location` on a 200,
so `redirects: { "/old": "/new" }` sent the visitor nowhere.

Stop an external redirect returning 500. Astro builds one with
`Response.redirect()`, whose headers are immutable, and the adapter wrote a
`Cache-Control` header into them.
