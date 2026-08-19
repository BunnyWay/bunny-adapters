/**
 * A site with nothing rendered on demand.
 *
 * Every page comes out of Bunny Storage, and the script exists only to find it
 * and give it a content type. This is the cheapest way to run a site on the
 * edge, and the adapter says it supports it, so the suite has to prove it.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("static-output", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("static-output");
  });
  after(() => site?.close());

  it("prerenders every page", async () => {
    const files = await site.files();
    for (const expected of ["index.html", "about/index.html", "404.html"]) {
      assert.ok(files.includes(expected), `${expected} is missing from ${files.join(", ")}`);
    }
  });

  it("still builds one deployable file", () => {
    assert.ok(site.hasBundle());
  });

  it("serves the home page out of Storage", async () => {
    const page = await site.get("/");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "home"), "home");
  });

  it("never renders the page again", async () => {
    const first = await site.get("/");
    const second = await site.get("/");
    assert.equal(
      textOf(first.body, "built-at"),
      textOf(second.body, "built-at"),
      "the build timestamp changed, so the page was rendered again",
    );
  });

  it("serves a nested page", async () => {
    const page = await site.get("/about");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "prerendered"), "yes");
  });

  it("serves the stylesheet and a public file", async () => {
    const page = await site.get("/");
    const href = page.body.match(/href="(\/_astro\/[^"]+\.css)"/)?.[1];
    assert.ok(href, "the page links no stylesheet");

    const asset = await site.get(href);
    assert.equal(asset.status, 200);
    assert.ok(asset.headers.get("content-type").startsWith("text/css"));
    assert.match(asset.headers.get("cache-control"), /immutable/);

    const robots = await site.get("/robots.txt");
    assert.equal(robots.status, 200);
  });

  it("gives an unknown path the 404 page", async () => {
    const page = await site.get("/nothing-is-here");
    assert.equal(page.status, 404);
    assert.equal(textOf(page.body, "not-found"), "nothing here");
  });

  it("gives a stored page the page lifetime, not the asset one", async () => {
    const page = await site.get("/about");
    assert.equal(page.headers.get("cache-control"), "public, max-age=60");
  });
});
