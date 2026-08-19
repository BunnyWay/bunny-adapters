---
"@bunny.net/astro-adapter": minor
---

One command deploys the site: `bunny deploy`.

The build now writes `.bunny/build.json`, which describes what it produced: the
file to deploy, the folder of client files, and the pull zone settings and script
variables the site needs. The bunny CLI reads that manifest, so it deploys this
adapter without knowing anything about Astro, and the next adapter needs no new
CLI.

What that buys a developer:

- `bunny deploy` creates the storage zone, the Edge Script, and the pull zone on
  the first run, uploads the build, sets every variable, and publishes. No
  password passes through the terminal, and no API call is written by hand.
- Each deploy lives in its own folder in the zone, and the CLI writes the folder's
  name into the top of the bundle. So a published release can only read the files
  it was built with, and `bunny rollback` restores a page and its assets together.
- The CLI applies the settings this adapter asks for — cookies on, Smart Cache off
  — and says which ones it changed. The guide used to ask for two raw API calls.

**Breaking:** the `bunny-astro` command is gone. `bunny deploy` replaces it, and
adds deploys, rollback, and provisioning. A deploy you run yourself still works:
read `BUNNY_ASSET_PREFIX` if the files are in a folder rather than at the zone
root.
