/// <reference types="astro/client" />

/**
 * `Astro.locals.runtime` carries what the bunny.net edge knows about the
 * request. Copy this block into your own project to get the types.
 */
type BunnyRuntime = import("@bunny.net/astro-adapter").BunnyRuntime;

declare namespace App {
  interface Locals {
    runtime: BunnyRuntime;
    /** Set by src/middleware.ts, to show how middleware feeds a page. */
    country: string;
  }
}
