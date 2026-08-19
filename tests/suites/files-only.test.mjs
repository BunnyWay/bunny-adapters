/**
 * The only build that needs no script.
 *
 * `kind: "static"` is a promise that plain files behave the same way. Bunny
 * Storage holds objects and nothing else: it cannot answer a 404 with the page
 * Astro built, cannot redirect, and cannot add a header. So a build makes that
 * promise only when it needs none of the three, which is what this fixture is.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";
import { buildFixture } from "../harness.mjs";

describe("files-only", () => {
  /** @type {Awaited<ReturnType<typeof buildFixture>>} */
  let site;

  before(async () => {
    site = await buildFixture("files-only");
  });

  it("tells the CLI to deploy the files, and names no script", () => {
    const manifest = site.manifest();
    assert.equal(manifest.kind, "static");
    assert.equal(manifest.script, undefined);
    assert.equal(manifest.assets.dir, "dist/client");
  });

  it("says so, and says what would need a script", () => {
    assert.match(site.log, /Every route is prerendered/);
    assert.match(site.log, /deploys no script/);
    assert.match(site.log, /server:defer/);
  });

  // `astro preview` runs the file that would be deployed, so the build writes
  // one even when the deploy has no use for it.
  it("still builds a bundle for astro preview", () => {
    assert.ok(site.hasBundle());
  });

  it("prerendered both pages", async () => {
    const files = await site.files();
    assert.ok(files.includes("index.html"));
    assert.ok(files.includes("about/index.html"));
  });
});
