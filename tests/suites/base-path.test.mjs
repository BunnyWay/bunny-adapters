/**
 * A site that lives under a path, not at the root of its domain.
 *
 * Astro writes the client build with no `base` prefix, and the browser asks for
 * every file with one. So the prefix has to come off before the script reads
 * Bunny Storage. Nothing else in the suite catches this, and it breaks the
 * whole site when it is wrong.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("base-path", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("base-path");
  });
  after(() => site?.close());

  it("writes the build with no base prefix, which is why one has to come off", async () => {
    const files = await site.files();
    assert.ok(files.includes("about/index.html"), files.join(", "));
    assert.ok(!files.some((file) => file.startsWith("docs/")), "the build has a docs/ folder");
  });

  it("renders the page Astro owns", async () => {
    const page = await site.get("/docs/");
    assert.equal(page.status, 200);
    assert.ok(textOf(page.body, "rendered-at"), "the page did not render");
  });

  it("serves a prerendered page out of Storage", async () => {
    const page = await site.get("/docs/about");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "prerendered"), "yes");
    assert.ok(page.headers.get("content-type").startsWith("text/html"));
  });

  it("serves a hashed asset out of Storage", async () => {
    const page = await site.get("/docs/about");
    const href = page.body.match(/href="([^"]*_astro\/[^"]+\.css)"/)?.[1];
    assert.ok(href, "the page links no stylesheet");
    assert.ok(href.startsWith("/docs/_astro/"), `the link is ${href}`);

    const asset = await site.get(href);
    assert.equal(asset.status, 200);
    assert.ok(asset.headers.get("content-type").startsWith("text/css"));
  });

  it("serves a file from public/", async () => {
    const file = await site.get("/docs/robots.txt");
    assert.equal(file.status, 200);
    assert.ok(file.headers.get("content-type").startsWith("text/plain"));
  });

  it("answers an endpoint under the base", async () => {
    const answer = await site.get("/docs/api/where");
    assert.equal(answer.status, 200);
    assert.equal(JSON.parse(answer.body).pathname, "/docs/api/where");
  });

  it("gives an unknown path under the base the 404 page", async () => {
    const page = await site.get("/docs/nothing-is-here");
    assert.equal(page.status, 404);
    assert.equal(textOf(page.body, "not-found"), "nothing here");
  });

  it("serves nothing outside the base, because no such object exists", async () => {
    for (const path of ["/about", "/robots.txt"]) {
      const page = await site.get(path);
      assert.equal(page.status, 404, `${path} answered ${page.status}`);
    }
  });

  it("does not treat a longer prefix as the base", async () => {
    const page = await site.get("/docsearch/about");
    assert.equal(page.status, 404);
  });

  it("answers HEAD without a body", async () => {
    const page = await site.get("/docs/about", { method: "HEAD" });
    assert.equal(page.status, 200);
    assert.equal(page.body, "");
  });
});
