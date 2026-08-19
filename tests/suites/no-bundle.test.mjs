/**
 * `bundle: false`, which a project that runs its own bundler uses.
 *
 * The adapter has to stop after the Astro build: no single file, and no
 * deleting the server output it would have bundled. Nothing else in the suite
 * exercises that branch, and it is the one people reach for when the esbuild
 * step will not do what they need.
 */
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, before } from "node:test";
import { buildFixture } from "../harness.mjs";

describe("no-bundle", () => {
  /** @type {Awaited<ReturnType<typeof buildFixture>>} */
  let built;

  before(async () => {
    built = await buildFixture("no-bundle");
  });

  it("writes no single file", () => {
    assert.ok(!built.hasBundle(), "dist/index.js was written anyway");
  });

  it("keeps the server output, which the project's own bundler needs", () => {
    assert.ok(
      existsSync(path.join(built.dist, "server/entry.mjs")),
      "dist/server was cleared away",
    );
  });

  it("says what it skipped, and names the entry", () => {
    assert.match(built.log, /Skipped bundling/);
    assert.match(built.log, /entry\.mjs/);
  });

  it("promises no deploy it cannot do", () => {
    assert.ok(!/bunny deploy/.test(built.log), built.log);
    assert.ok(!/Bundled to/.test(built.log), built.log);
    // No build manifest either: there is no single file for the CLI to deploy.
    assert.ok(!/build\.json/.test(built.log), built.log);
  });

  it("writes no build info, because astro preview has nothing to run", () => {
    // `astro preview` then says so plainly instead of running the wrong thing.
    assert.ok(!existsSync(path.join(built.dist, ".bunny-adapter.json")));
  });

  it("still builds the client output", async () => {
    const files = await built.files();
    assert.ok(files.includes("about/index.html"), files.join(", "));
  });
});
