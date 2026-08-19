/**
 * The `bunny-astro` command, against a writable local zone.
 *
 * The CLI is the half of a deploy that nothing else covers. It is also the half
 * where a quiet failure is expensive: `deploy` uploads first and deploys second,
 * so an upload that does nothing and reports success ships a new script against
 * the previous build's assets.
 *
 * So these checks count what actually reached the zone. A success line is not
 * evidence.
 */
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import path from "node:path";
import { startLocalZone } from "../../packages/astro/dist/build/local-zone.js";

const cli = fileURLToPath(new URL("../../packages/astro/dist/bin/cli.js", import.meta.url));

/** Run the CLI, and hand back everything it said. */
function runCli(args) {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(process.execPath, [cli, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.once("exit", (code) => resolve({ code, output }));
  });
}

describe("the bunny-astro command", () => {
  /** @type {Awaited<ReturnType<typeof startLocalZone>>} */
  let zone;
  let dir;
  let client;

  /** Every object the zone holds, as POSIX paths. */
  const uploaded = () =>
    zone.requests.filter((request) => request.startsWith("/assets/")).map((r) => r.slice(8));

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "bunny-astro-cli-"));
    client = path.join(dir, "client");
    await mkdir(path.join(client, "_astro"), { recursive: true });
    await writeFile(path.join(client, "index.html"), "<!doctype html>");
    await writeFile(path.join(client, "_astro/app.css"), "body{}");
    // A name that means something else in a URL. It has to arrive intact.
    await writeFile(path.join(client, "_astro/a b&c.css"), ".x{}");
    zone = await startLocalZone({ dir: path.join(dir, "zone"), zone: "assets" });
  });

  after(async () => {
    await zone?.close();
    await rm(dir, { recursive: true, force: true });
  });

  const baseArgs = () => ["--dir", client, "--zone", "assets", "--host", zone.host, "--key", "k"];

  it("uploads every file, and says how many", async () => {
    const result = await runCli(["upload", ...baseArgs()]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Upload complete\./);
    assert.equal(uploaded().length, 3, result.output);
  });

  it("keeps a name that means something else in a URL", async () => {
    // Unencoded, the `&` would survive but a `?` or a `#` would truncate the
    // path, and the object would land under the wrong name.
    const stored = await readFile(path.join(dir, "zone/_astro/a b&c.css"), "utf8");
    assert.equal(stored, ".x{}");
  });

  it("refuses a --concurrency that would upload nothing", async () => {
    // Number("eight") is NaN, and a NaN worker count builds an empty pool. The
    // command used to print "Upload complete." and exit 0 having sent nothing.
    for (const value of ["eight", "0", "-1", "1.5", ""]) {
      const before = uploaded().length;
      const result = await runCli(["upload", ...baseArgs(), "--concurrency", value]);

      assert.equal(result.code, 1, `--concurrency ${JSON.stringify(value)}: ${result.output}`);
      assert.match(result.output, /--concurrency must be a whole number/);
      assert.doesNotMatch(result.output, /Upload complete/);
      assert.equal(uploaded().length, before, "a refused run still uploaded something");
    }
  });

  it("accepts a --concurrency it can use", async () => {
    const before = uploaded().length;
    const result = await runCli(["upload", ...baseArgs(), "--concurrency", "2"]);
    assert.equal(result.code, 0, result.output);
    assert.equal(uploaded().length - before, 3);
  });

  it("stops before it uploads when no zone is named", async () => {
    const result = await runCli(["upload", "--dir", client, "--key", "k"]);
    assert.equal(result.code, 1);
    assert.match(result.output, /No storage zone/);
  });

  it("lists what it would send, and sends nothing, on a dry run", async () => {
    const before = uploaded().length;
    const result = await runCli(["upload", ...baseArgs(), "--dry-run"]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Would upload 3 file\(s\)/);
    assert.equal(uploaded().length, before);
  });
});
