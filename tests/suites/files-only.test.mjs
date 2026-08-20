/**
 * The shape that needs neither a script nor the adapter.
 *
 * Every route prerendered, no 404 page, no redirect, and no header to apply.
 * `bunny deploy` uploads the files, the CDN serves them out of Bunny Storage,
 * and nothing is invoked per request.
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

  // A static build asks for no script, so it asks for no variable and no pull
  // zone setting either. Those are what a script needs to run.
  it("asks the CLI for nothing else", () => {
    assert.equal(site.manifest().requires, undefined);
  });

  it("says so, and says what the adapter is still for", () => {
    assert.match(site.log, /Every route is prerendered/);
    assert.match(site.log, /deploys no script/);
    assert.match(site.log, /Nothing here needs the adapter/);
    assert.match(site.log, /server:defer/);
  });

  it("builds no script", () => {
    assert.ok(!site.hasBundle(), "the build wrote dist/index.js");
  });

  // `noop` is the default because transforming on demand needs `sharp`, which
  // the edge cannot run. Nothing here renders on demand, so nothing here needs
  // the default, and the build says so.
  it("points at sharp, because no route renders on demand", () => {
    assert.match(site.log, /image\(s\) went into the build untransformed/);
    assert.match(site.log, /imageService: false/);
  });

  it("prerendered both pages", async () => {
    const files = await site.files();
    assert.ok(files.includes("index.html"));
    assert.ok(files.includes("about/index.html"));
  });
});
