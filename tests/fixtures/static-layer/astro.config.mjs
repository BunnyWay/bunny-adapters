// A fully prerendered site that still needs the two things files cannot say: a
// redirect with a real status, and a response header. Astro writes a
// meta-refresh page for the redirect, and Bunny Storage holds no headers, so
// the build writes `_redirects` and `_headers` beside the pages and the
// `bunny sites` router applies them.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  build: { inlineStylesheets: "never" },
  security: { csp: true },
  redirects: {
    "/old": "/about",
    "/gone": { status: 302, destination: "/about" },
    "/away": "https://example.com/",
  },
  adapter: bunny(),
});
