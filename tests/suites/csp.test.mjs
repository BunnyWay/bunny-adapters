/**
 * A content security policy, delivered as a response header.
 *
 * Astro works the hashes out at build time and hands the adapter a header per
 * page. Bunny Storage cannot hold a header, so the script has to add it back
 * when it serves the page. A policy that goes missing is a silent failure: the
 * page still works, and it is no longer protected.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("csp", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("csp");
  });
  after(() => site?.close());

  it("adds the policy to a page read out of Storage", async () => {
    const page = await site.get("/about");
    assert.equal(page.status, 200);
    const policy = page.headers.get("content-security-policy");
    assert.ok(policy, "the stored page carries no policy");
    assert.match(policy, /script-src/);
    assert.match(policy, /sha256-/);
  });

  it("adds the policy to a page it renders", async () => {
    const page = await site.get("/");
    assert.ok(page.headers.get("content-security-policy"), "the rendered page carries no policy");
  });

  it("adds the policy to the 404 page", async () => {
    const page = await site.get("/nothing-is-here");
    assert.equal(page.status, 404);
    assert.equal(textOf(page.body, "not-found"), "nothing here");
    assert.ok(page.headers.get("content-security-policy"), "the 404 page carries no policy");
  });

  it("keeps the charset, which Astro's own content type would lose", async () => {
    const page = await site.get("/about");
    assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  });

  // A page out of Storage is not an asset, and it must not be cached like one:
  // the next deploy replaces it under the same name.
  it("gives a stored page the page lifetime, not the asset one", async () => {
    const page = await site.get("/about");
    assert.equal(page.headers.get("cache-control"), "public, max-age=60");
  });

  it("sends one policy, not two", async () => {
    const page = await site.get("/about");
    const all = page.headers.getSetCookie ? page.headers.get("content-security-policy") : null;
    assert.ok(!all?.includes("script-src", all.indexOf("script-src") + 1), "the policy is doubled");
  });

  it("does not carry the policy on an asset, which needs none", async () => {
    const page = await site.get("/about");
    const href = page.body.match(/href="(\/_astro\/[^"]+\.css)"/)?.[1];
    assert.ok(href, "the page links no stylesheet");

    const asset = await site.get(href);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get("content-security-policy"), null);
  });
});
