import type { APIRoute } from "astro";

// Two cookies must arrive as two headers. Joining them with a comma breaks
// both, because a cookie value may hold a comma of its own.
export const GET: APIRoute = ({ cookies }) => {
  cookies.set("first", "one", { path: "/" });
  cookies.set("second", "two", { path: "/", httpOnly: true });
  return new Response("ok");
};
