// Every shape of redirect Astro offers.
//
// A redirect to a prerendered page becomes a page of its own, and the script
// has to answer it with a status rather than serve it. A redirect to another
// host becomes a `Response.redirect()`, whose headers cannot be written to.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: bunny(),
  redirects: {
    "/old": "/about",
    "/gone": { status: 302, destination: "/about" },
    "/away": "https://example.com/",
    "/legacy/[id]": "/new/[id]",
  },
});
