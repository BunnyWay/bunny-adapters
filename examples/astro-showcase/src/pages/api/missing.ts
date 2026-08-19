import type { APIRoute } from "astro";

/**
 * An endpoint that answers 404 with no body.
 *
 * A *page* that does this gets the site's 404 page instead, which is what
 * `/blog/missing` demonstrates. An endpoint does not: Astro leaves it alone, so
 * a client asking for JSON is never handed a web page. This route exists to
 * hold that difference in place.
 */
export const GET: APIRoute = () => new Response(null, { status: 404 });
