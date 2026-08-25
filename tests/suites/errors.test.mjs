/**
 * What the visitor sees when something goes wrong.
 *
 * This fixture has a 500 page and no 404 page. Both halves matter. The script
 * has to reach back into Storage for the page that exists, and it must not fail
 * over the one that does not.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("errors", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("errors");
  });
  after(() => site?.close());

  it("prerenders the 500 page and no 404 page", async () => {
    const files = await site.files();
    assert.ok(files.includes("500.html"), files.join(", "));
    assert.ok(!files.includes("404.html"), "the fixture has a 404 page after all");
  });

  it("shows the 500 page when a page throws", async () => {
    const page = await site.get("/boom");
    assert.equal(page.status, 500);
    assert.equal(textOf(page.body, "server-error"), "something broke");
  });

  it("answers a bare 404 when the project has no 404 page", async () => {
    const page = await site.get("/nothing-is-here");
    assert.equal(page.status, 404);
    assert.ok(!page.body.includes("something broke"), "the 500 page came back for a 404");
  });

  it("gives an endpoint that throws the 500 status", async () => {
    // Astro decides what the body is, and it hands back the 500 page even for
    // an endpoint. The adapter only has to keep the status honest.
    const page = await site.get("/api/boom");
    assert.equal(page.status, 500);
  });

  it("passes a 404 a page chose for itself through", async () => {
    const page = await site.get("/gone");
    assert.equal(page.status, 404);
  });

  it("keeps working after an error", async () => {
    // A thrown error must not leave the isolate unable to answer.
    await site.get("/boom");
    const page = await site.get("/");
    assert.equal(page.status, 200);
    assert.ok(textOf(page.body, "rendered-at"), "the site stopped answering");
  });

  it("never lets a 500 be cached", async () => {
    // A pull zone that caches a 500 hands one transient failure to everybody
    // who asks for that path until it expires.
    for (const path of ["/boom", "/api/boom"]) {
      const value = (await site.get(path)).headers.get("cache-control") ?? "";
      assert.match(value, /no-store/, `${path} answered "${value}"`);
    }
  });

  it("says how a 404 may be cached", async () => {
    const value = (await site.get("/nothing-is-here")).headers.get("cache-control");
    assert.ok(value, "the 404 carries no Cache-Control");
  });
});
