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

  it("asks Storage for nothing outside the zone, whatever the shape", async () => {
    // A 404 alone proves only that the traversal found nothing. What matters
    // is where the script looked, so the zone records every path it was asked
    // for. `%2e%2e` and `\` are the two the URL parser decodes for itself,
    // after the path filter has already run.
    const hostile = [
      "/_astro/../../../../etc/passwd",
      "/%2e%2e/%2e%2e/other-zone/secret.json",
      "/%252e%252e/other-zone/secret.json",
      "/a/%252e%252e/%252e%252e/other-zone/secret.json",
      "/..%5c..%5cother-zone/secret.json",
      "/asset%3Fdownload=1",
      "/asset%23fragment",
    ];

    const before = site.zone.requests.length;
    for (const pathname of hostile) {
      const page = await site.get(pathname);
      assert.equal(page.status, 404, `${pathname} answered ${page.status}`);
    }

    const asked = site.zone.requests.slice(before);
    assert.ok(asked.length > 0, "no request reached Storage, so nothing was proven");
    for (const request of asked) {
      assert.ok(
        request.startsWith("/fixture/"),
        `the script asked Storage for ${request}, which is outside the zone`,
      );
    }
  });

  it("refuses a write method on a stored object", async () => {
    // With no file list the script has to ask Storage first, so this is the
    // path where the refusal happens after the object is known to be there.
    const page = await site.get("/robots.txt", { method: "DELETE" });
    assert.equal(page.status, 405);
    assert.equal(page.headers.get("allow"), "GET, HEAD");
  });

  it("answers HEAD without a body", async () => {
    const page = await site.get("/about", { method: "HEAD" });
    assert.equal(page.status, 200);
    assert.equal(page.body, "");
  });
});
