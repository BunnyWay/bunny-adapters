// A site whose files a deploy puts in a folder of its own. One route renders per
// request, so the build deploys a script, and the other two are prerendered:
// those are the ones the script has to find inside the deploy's folder.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  build: { inlineStylesheets: "never" },
  adapter: bunny(),
});
