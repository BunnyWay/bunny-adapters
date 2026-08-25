// Astro actions are a POST endpoint under /_actions, and they answer with a
// devalue payload rather than JSON.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: bunny(),
});
