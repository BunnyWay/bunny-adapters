import type { APIRoute } from "astro";

export const GET: APIRoute = ({ url }) =>
  Response.json({ raw: url.search, name: url.searchParams.get("name") });
