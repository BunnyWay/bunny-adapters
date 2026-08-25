import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  return Response.json({
    bytes: new TextEncoder().encode(body).length,
    type: request.headers.get("content-type"),
    method: request.method,
  });
};

export const PUT: APIRoute = async ({ request }) =>
  Response.json({ method: request.method, body: await request.text() });

export const DELETE: APIRoute = ({ request }) => Response.json({ method: request.method });

export const PATCH: APIRoute = ({ request }) => Response.json({ method: request.method });
