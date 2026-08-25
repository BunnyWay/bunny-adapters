import { defineMiddleware } from "astro:middleware";

/**
 * Middleware runs inside the Edge Script, on every route Astro owns.
 *
 * It also runs while Astro prerenders a page at build time, where there is no
 * live request. Guard against that, or the build warns about reading headers.
 */
export const onRequest = defineMiddleware((context, next) => {
  if (context.isPrerendered) return next();

  context.locals.country = context.locals.runtime?.country ?? "unknown";
  return next();
});
