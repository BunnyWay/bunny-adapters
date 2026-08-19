import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { APIRoute } from "astro";

/**
 * Edge Scripting gives each script a virtual file system, so `node:fs` works
 * inside the bundle. It lives in the isolate's memory, which means:
 *
 * - it starts empty on every cold start;
 * - one isolate cannot see what another wrote;
 * - what it holds counts against the script's memory.
 *
 * So it is a scratch pad for one request, and never a store. Anything that has
 * to outlive a request belongs in Bunny Storage, which is what the adapter uses
 * for assets and for sessions.
 *
 * @see https://bunny.net/docs/scripting/node-fs
 */
export const GET: APIRoute = async () => {
  const dir = "/tmp/astro-showcase";
  const file = `${dir}/scratch.txt`;
  const written = new Date().toISOString();

  await mkdir(dir, { recursive: true });
  await writeFile(file, `written at ${written}`, "utf8");
  const readBack = await readFile(file, "utf8");
  await rm(file);

  return Response.json({
    ok: readBack === `written at ${written}`,
    readBack,
    note: "node:fs works, but the file system is per isolate and lives in memory.",
  });
};
