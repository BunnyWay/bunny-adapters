import type { APIRoute } from "astro";

/**
 * A server endpoint. It runs inside the Edge Script, per request.
 */
export const GET: APIRoute = ({ locals, clientAddress }) =>
  Response.json({
    ok: true,
    message: "Hello from bunny.net Edge Scripting.",
    at: new Date().toISOString(),
    country: locals.runtime?.country ?? "unknown",
    clientAddress: clientAddress || "unknown",
  });

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  return Response.json({ ok: true, received: body.length });
};
