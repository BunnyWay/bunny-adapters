import type { APIRoute } from "astro";

// A response may carry the same header name twice, and both must arrive.
export const GET: APIRoute = () => {
  const headers = new Headers({ "content-type": "text/plain" });
  headers.append("x-fixture", "one");
  headers.append("x-fixture", "two");
  return new Response("ok", { headers });
};
