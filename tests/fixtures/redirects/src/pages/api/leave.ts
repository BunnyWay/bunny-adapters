import type { APIRoute } from "astro";

// A route may build its own redirect, and `Response.redirect()` gives a
// response whose headers are immutable.
export const GET: APIRoute = () => Response.redirect("https://example.net/", 302);
