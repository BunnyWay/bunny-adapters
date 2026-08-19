import type { APIRoute } from "astro";

export const GET: APIRoute = ({ url }) => Response.json({ pathname: url.pathname });
