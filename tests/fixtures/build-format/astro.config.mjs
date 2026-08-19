// `build.format: "file"` writes `about.html` instead of `about/index.html`.
// The script has to find either shape.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  build: { format: "file" },
  adapter: bunny(),
});
