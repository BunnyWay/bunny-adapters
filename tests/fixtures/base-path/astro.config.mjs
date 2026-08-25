// A site that does not live at the root of its domain.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  base: "/docs",
  // Emit a stylesheet file, so the fixture proves an asset lookup under `base`.
  build: { inlineStylesheets: "never" },
  adapter: bunny(),
});
