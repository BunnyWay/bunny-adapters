// Every option the adapter fills in by default, turned off. A project that
// brings its own session driver or its own cache provider must keep it.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: bunny({
    sessions: false,
    cache: false,
    imageService: false,
    assetCacheControl: "public, max-age=600",
    pageCacheControl: "public, max-age=5",
    serverCacheControl: "no-store, max-age=0",
  }),
  // The adapter registers no provider, so these rules reach nobody.
  routeRules: {
    "/cached": { maxAge: 60, tags: ["demo"] },
  },
  image: {
    // The adapter leaves the project's own choice alone.
    service: { entrypoint: "astro/assets/services/noop" },
  },
  build: { inlineStylesheets: "never" },
});
