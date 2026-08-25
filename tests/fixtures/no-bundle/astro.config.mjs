// `bundle: false` is for a project that runs its own bundler. The adapter has
// to stop after the Astro build and leave the server output alone.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: bunny({ bundle: false }),
});
