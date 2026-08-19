---
"@bunny.net/astro-adapter": patch
---

Keep every storage request inside the configured zone. The script decoded a
request path once, dropped each `..` segment, and then put the result into a URL
without encoding it. The URL parser decoded a second time, and it reads `%2e%2e`
as a level up and `\` as a separator. So `/%252e%252e/other-zone/x` and
`/..%5c..%5cother-zone/x` both left the zone, carrying the zone password. The
script now encodes each segment before it asks Storage, and a backslash
separates a path in the same way a slash does.

This was reachable only with `assetManifest: false`, or above 20 000 client
files. With the inlined file list the script rejects an unknown path before it
asks Storage at all.

Keep a preview session out of the folder you publish. `astro preview` gave the
script one local zone for assets and for sessions, and that zone served
`dist/client`. Every session written while previewing landed in the folder
a deploy sends to the public asset zone. Sessions now get a zone of
their own, over `dist/.preview-sessions`.

Refuse a `--concurrency` that cannot upload. `Number("eight")` is `NaN`, and a
`NaN` worker count built an empty pool. The upload then sent nothing,
printed `Upload complete.`, and exited 0. `deploy` uploads before it deploys, so
a typo shipped a new script against the previous build's assets. The command now
stops on any value that is not a whole number of 1 or more.

Keep the bundle when `outfile` points inside `build.server`. The adapter cleared
the server output after bundling, without checking where the bundle went. The
build reported the file, deleted it, and still succeeded.

Answer 405 for a write method on a stored object. A `DELETE` used to get 200 and
the whole file. The refusal comes only once the object is known to be there, so
a `POST` to an unknown path still reaches the site's 404 page.

Hold an image request to `maxWidth` on both sides. Only `width` was clamped, so
a crafted URL could ask Optimizer for any height, and `fit: "cover"` built its
crop box from that height. Quality is now held to the 1 to 100 scale the option
type documents.

Say when Bunny Storage refuses the script. A 401 or a 403 was indistinguishable
from a missing object, so a mistyped password made every page 404 with nothing
in the log. The script now writes one line naming the zone and the status.

Raise the Node floor to 22.12, which is what Astro 7 needs. The package asked
for Node 20 or later, so npm would install it on a version that cannot run
Astro at all.

Also: an empty `PORT` no longer makes the script listen on a random port, and
the published package carries the sources its maps name.
