import type { APIRoute } from "astro";
import { getSecret } from "astro:env/server";

export const GET: APIRoute = () =>
  Response.json({
    fromSchema: getSecret("FIXTURE_SECRET") ?? null,
    unlisted: getSecret("FIXTURE_UNLISTED") ?? null,
  });
