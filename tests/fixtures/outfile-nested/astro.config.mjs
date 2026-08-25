// `outfile` pointed inside the server output. Removing that folder would delete
// the bundle the build just wrote, so the adapter has to keep it instead.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: bunny({ outfile: "dist/server/index.js" }),
});
