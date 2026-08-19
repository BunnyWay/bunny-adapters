/**
 * `assetManifest: false`, which a very large site falls back to.
 *
 * With no inlined file list the script cannot know whether Storage holds a
 * path, so it asks. The result the visitor sees must be identical, and only the
 * subrequest count changes. A site that grows past the limit would otherwise
 * change behaviour on a build nobody touched.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("no-manifest", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("no-manifest");
  });
  after(() => site?.close());

  it("inlines no file list, and says nothing about one", () => {
    assert.ok(!/Inlined \d+ client file/.test(site.log), site.log);
    assert.match(site.code(), /assets:\s*null/);
  });

  it("finds a prerendered page by asking Storage", async () => {
    const page = await site.get("/about");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "prerendered"), "yes");
  });

  it("finds a hashed asset by asking Storage", async () => {
    const page = await site.get("/");
    const href = page.body.match(/href="(\/_astro\/[^"]+\.css)"/)?.[1];
    assert.ok(href, "the page links no stylesheet");

    const asset = await site.get(href);
    assert.equal(asset.status, 200);
    assert.ok(asset.headers.get("content-type").startsWith("text/css"));
  });

  it("finds a file from public/", async () => {
    assert.equal((await site.get("/robots.txt")).status, 200);
  });

  it("gives an unknown path the 404 page", async () => {
    const page = await site.get("/nothing-is-here");
    assert.equal(page.status, 404);
    assert.equal(textOf(page.body, "not-found"), "nothing here");
  });

  it("refuses a path that climbs out of the zone", async () => {
    // Without the file list every path reaches Storage, so this is the run
    // where a traversal would actually be attempted.
    const page = await site.get("/_astro/../../../../etc/passwd");
    assert.equal(page.status, 404);
    assert.ok(!page.body.includes("root:"), "the script read a file outside the zone");
  });

  it("answers HEAD without a body", async () => {
    const page = await site.get("/about", { method: "HEAD" });
    assert.equal(page.status, 200);
    assert.equal(page.body, "");
  });
});
