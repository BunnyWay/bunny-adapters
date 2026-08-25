// Astro can put a content security policy in a response header instead of a
// `<meta>` tag, and it asks the adapter to carry it. Bunny Storage cannot hold
// a header, so the script has to add it back.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  build: { inlineStylesheets: "never" },
  security: { csp: true },
  adapter: bunny(),
});
