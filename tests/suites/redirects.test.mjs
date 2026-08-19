/**
 * Every shape of redirect Astro offers.
 *
 * Two of these were broken and neither showed up as an error. An internal
 * redirect to a prerendered page answered 200 with a `Location` header, which a
 * browser ignores. An external redirect answered 500, because Astro builds one
 * with `Response.redirect()` and its headers cannot be written to.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("redirects", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("redirects");
  });
  after(() => site?.close());

  it("says in the build log how many redirects the script answers", () => {
    assert.match(site.log, /Answering \d+ prerendered redirect\(s\)/);
  });

  it("sends a permanent redirect to a prerendered page", async () => {
    const page = await site.get("/old");
    assert.equal(page.status, 301);
    assert.equal(page.headers.get("location"), "/about");
    assert.equal(page.body, "", "a redirect must not carry the page");
  });

  it("keeps the status the route configured", async () => {
    const page = await site.get("/gone");
    assert.equal(page.status, 302);
    assert.equal(page.headers.get("location"), "/about");
  });

  it("follows through to the page it points at", async () => {
    const target = await site.get("/about");
    assert.equal(target.status, 200);
    assert.equal(textOf(target.body, "prerendered"), "yes");
  });

  it("fills in the parameters of a dynamic redirect", async () => {
    for (const id of ["a", "b"]) {
      const page = await site.get(`/legacy/${id}`);
      assert.equal(page.status, 301, `/legacy/${id} answered ${page.status}`);
      assert.equal(page.headers.get("location"), `/new/${id}`);
    }
  });

  it("leaves a parameter it has no page for alone", async () => {
    const page = await site.get("/legacy/never-built");
    assert.equal(page.status, 404);
  });

  it("answers 308 for a method that must keep its body", async () => {
    // A browser may turn a 301 on a POST into a GET, which loses the body.
    const page = await site.get("/old", { method: "POST" });
    assert.equal(page.status, 308);
    assert.equal(page.headers.get("location"), "/about");
  });

  it("redirects to another host without failing", async () => {
    const page = await site.get("/away");
    assert.equal(page.status, 301);
    assert.equal(page.headers.get("location"), "https://example.com/");
  });

  it("lets a route build its own external redirect", async () => {
    // `Response.redirect()` gives immutable headers, and the adapter used to
    // write a Cache-Control header into them.
    const page = await site.get("/api/leave");
    assert.equal(page.status, 302);
    assert.equal(page.headers.get("location"), "https://example.net/");
  });

  it("says how a redirect may be cached", async () => {
    // A pull zone applies its own expiration to a response with no directive.
    for (const path of ["/old", "/away", "/api/leave", "/from-page"]) {
      const value = (await site.get(path)).headers.get("cache-control");
      assert.ok(value, `${path} carries no Cache-Control`);
    }
  });

  it("passes Astro.redirect through with its own status", async () => {
    const page = await site.get("/from-page");
    assert.equal(page.status, 307);
    assert.equal(page.headers.get("location"), "/about");
  });
});
