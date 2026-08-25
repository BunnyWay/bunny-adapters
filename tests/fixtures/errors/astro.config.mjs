// A project with a 500 page and no 404 page. Both halves matter: the script
// has to find the page that exists, and it must not fail over the one that
// does not.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: bunny(),
});
