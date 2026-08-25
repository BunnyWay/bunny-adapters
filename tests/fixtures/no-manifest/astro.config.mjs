// `assetManifest: false` is what a very large site falls back to. The script
// then asks Storage whether an object exists instead of knowing.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  build: { inlineStylesheets: "never" },
  adapter: bunny({ assetManifest: false }),
});
