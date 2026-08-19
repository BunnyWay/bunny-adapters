import type { APIRoute } from "astro";

// A binary body must survive whole, and the bytes must not be re-encoded.
export const POST: APIRoute = async ({ request }) => {
  const bytes = new Uint8Array(await request.arrayBuffer());
  let sum = 0;
  for (const byte of bytes) sum += byte;
  return Response.json({ length: bytes.length, sum });
};
