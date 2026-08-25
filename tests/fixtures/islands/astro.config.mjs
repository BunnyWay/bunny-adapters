// A framework island, hydrated in the browser, and a server island rendered
// after the page is sent. The client island proves the script serves the
// framework bundle out of Storage, which is the part the adapter owns.
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  integrations: [svelte()],
  adapter: bunny(),
});
