// What every project needs from the runtime, whatever else it configures:
// cookies, streams, request bodies, secrets, and methods.
import { defineConfig, envField } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: bunny(),
  env: {
    schema: {
      PUBLIC_LABEL: envField.string({ context: "client", access: "public", default: "fixture" }),
      FIXTURE_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
