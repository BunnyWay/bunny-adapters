import type { APIRoute } from "astro";

// A client that calls an endpoint must never be handed a web page.
export const GET: APIRoute = () => {
  throw new Error("boom on purpose");
};
