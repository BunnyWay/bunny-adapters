---
"@bunny.net/astro-adapter": patch
---

Report a build failure the way Astro does.

A build that cannot continue now throws `AstroError` from `astro/errors`, so
Astro prints it in its own error box, with the advice on its own line as a hint.
Before this, a script above the 10 MB limit arrived as a plain `Error`, which
Astro renders as an unhandled hook failure and a stack trace. The message said
what to do somewhere inside all of that.

Five failures changed: the size limit, and the four in `astro preview`. Every
throw the script itself can reach stays a plain `Error`, because `astro/errors`
is Astro's own code and it must not enter a bundle that has 10 MB and 500 ms.
