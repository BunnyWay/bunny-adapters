// The one shape that needs no script: every route prerendered, no 404 page, no
// redirect, and no header to apply. Bunny Storage behind the CDN answers every
// request here exactly as the script would, for less, so the build tells the CLI
// to deploy the files alone.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  adapter: bunny(),
});
