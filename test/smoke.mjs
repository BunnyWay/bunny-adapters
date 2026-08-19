/**
 * Build the fixture with the adapter, run the bundle on Deno, and check that
 * the pieces that matter still work: SSR, endpoints, cookies, prerendering,
 * and a self-contained bundle.
 */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = path.join(root, "test/fixture");
const bundle = path.join(fixture, "dist/index.js");
const PORT = 8080;

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

async function get(pathname, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${PORT}${pathname}`, { headers });
  return { status: response.status, body: await response.text(), headers: response.headers };
}

console.log("building the fixture");
rmSync(path.join(fixture, "dist"), { recursive: true, force: true });
run("npx", ["astro", "build"], fixture);

console.log("\nchecking the build output");
check("dist/index.js exists", existsSync(bundle));
check("dist/server was removed", !existsSync(path.join(fixture, "dist/server")));
check("prerendered page is in dist/client", existsSync(path.join(fixture, "dist/client/static/index.html")));

const code = readFileSync(bundle, "utf8");
check("bundle pulls in no node-only server", !code.includes("@hono/node-server"));
check("bundle is one file under 10 MB", Buffer.byteLength(code) < 10 * 1024 * 1024,
  `${(Buffer.byteLength(code) / 1024).toFixed(0)} kB`);

console.log("\nstarting the bundle on Deno");
const server = spawn("deno", ["run", "-A", bundle], {
  stdio: "inherit",
  env: { ...process.env, BUNNY_STORAGE_ZONE: "" },
});

try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try { await get("/"); up = true; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  check("server responds", up);

  const first = await get("/");
  check("SSR page renders", first.status === 200 && first.body.includes('id="time"'));
  check("Astro.request.headers works", (await get("/", { "user-agent": "smoke-test" })).body.includes("smoke-test"));
  check("Astro.cookies.set sends Set-Cookie", /(^|\W)n=1/.test(first.headers.get("set-cookie") ?? ""),
    first.headers.get("set-cookie") ?? "absent");

  const second = await get("/", { cookie: "n=41" });
  check("Astro.cookies.get reads the cookie", second.body.includes('id="n">42<'));

  const a = (await get("/")).body.match(/id="time">([^<]+)/)?.[1];
  await new Promise((r) => setTimeout(r, 20));
  const b = (await get("/")).body.match(/id="time">([^<]+)/)?.[1];
  check("each request renders again", Boolean(a && b && a !== b));

  const api = await get("/api");
  check("server endpoint responds", api.status === 200 && JSON.parse(api.body).ok === true);

  check("unknown route gets Astro's 404", (await get("/missing")).status === 404);
} finally {
  server.kill();
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
