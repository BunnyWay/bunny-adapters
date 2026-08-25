// A whole site with nothing rendered on demand. Every page comes out of Bunny
// Storage, and the script exists only to find it and give it a content type.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "static",
  build: { inlineStylesheets: "never" },
  adapter: bunny(),
});
