/**
 * `build.format: "file"` writes `about.html` rather than `about/index.html`.
 *
 * The script cannot tell which shape it is looking at from the request path, so
 * it has to accept both. A project that changes the format after it is live
 * would otherwise lose every prerendered page.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("build-format", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("build-format");
  });
  after(() => site?.close());

  it("writes a page as a file, not as a folder", async () => {
    const files = await site.files();
    assert.ok(files.includes("about.html"), files.join(", "));
    assert.ok(!files.includes("about/index.html"), "the folder shape is there too");
  });

  it("serves the page for the path with no slash", async () => {
    const page = await site.get("/about");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "prerendered"), "yes");
  });

  it("serves the same page for the path with a slash", async () => {
    const page = await site.get("/about/");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "prerendered"), "yes");
  });

  it("serves a nested page", async () => {
    const page = await site.get("/guide/deep");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "deep"), "nested");
  });

  it("still renders the route Astro owns", async () => {
    const page = await site.get("/");
    assert.equal(page.status, 200);
    assert.ok(textOf(page.body, "rendered-at"));
  });

  it("still finds the 404 page", async () => {
    const page = await site.get("/nothing-is-here");
    assert.equal(page.status, 404);
    assert.equal(textOf(page.body, "not-found"), "nothing here");
  });

  it("gives the page the HTML content type, with a charset", async () => {
    const page = await site.get("/about");
    assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  });
});
