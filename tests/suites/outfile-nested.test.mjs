/**
 * `outfile` pointed inside the server output.
 *
 * The adapter clears the framework's intermediate server folder once the bundle
 * holds every chunk. Doing that without a check deleted the bundle itself when
 * it was written into that folder, and the build still reported success. A
 * developer then had a green build, a deploy instruction, and no file.
 */
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { before, describe, it } from "node:test";
import path from "node:path";
import { buildFixture } from "../harness.mjs";

describe("outfile-nested", () => {
  /** @type {Awaited<ReturnType<typeof buildFixture>>} */
  let built;

  before(async () => {
    built = await buildFixture("outfile-nested");
  });

  it("builds without an error", () => {
    assert.equal(built.status, 0, built.log);
  });

  it("keeps the bundle it reported", () => {
    assert.match(built.log, /Bundled to dist\/server\/index\.js/);
    assert.ok(
      existsSync(path.join(built.dist, "server/index.js")),
      "the build reported a bundle and then deleted it",
    );
  });

  it("says why the server output stayed", () => {
    assert.match(built.log, /outfile is inside dist\/server, so the server output was kept/);
  });

  it("still writes the client build", () => {
    assert.ok(existsSync(path.join(built.dist, "client")));
  });
});
