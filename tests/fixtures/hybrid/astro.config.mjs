// A project that says nothing about `output`, and has one route that renders per
// request. This is the commonest real shape there is, and the one the adapter
// used to get wrong: it read `output`, saw the default "static", and reported a
// build with no server. The deploy then dropped every route below.
import { defineConfig } from "astro/config";
import bunny from "@bunny.net/astro-adapter";

export default defineConfig({
  adapter: bunny(),
});
