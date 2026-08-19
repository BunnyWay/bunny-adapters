/**
 * Every option the adapter fills in by default, turned off.
 *
 * A project that brings its own session driver, its own cache provider, or its
 * own image service has to keep it. An adapter that quietly overrides a choice
 * the project made is worse than one that does nothing.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("options-off", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("options-off");
  });
  after(() => site?.close());

  it("registers no session driver of its own", () => {
    assert.ok(
      !site.code().includes("BUNNY_SESSION_ZONE"),
      "the bunny session driver is in the bundle",
    );
  });

  it("registers no cache provider, so routeRules add no headers", async () => {
    const page = await site.get("/cached");
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cdn-tag"), null);
    assert.ok(
      !(page.headers.get("cache-control") ?? "").includes("s-maxage"),
      `cache-control ${page.headers.get("cache-control")}`,
    );
  });

  it("says nothing about images, because it changed nothing", () => {
    assert.ok(!/Optimizer/.test(site.log), site.log);
    assert.ok(!/Images are not transformed/.test(site.log), site.log);
  });

  it("uses the Cache-Control the project chose for a rendered page", async () => {
    const page = await site.get("/");
    assert.equal(page.headers.get("cache-control"), "no-store, max-age=0");
  });

  it("uses the Cache-Control the project chose for a stored page", async () => {
    const page = await site.get("/about");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "prerendered"), "yes");
    assert.equal(page.headers.get("cache-control"), "public, max-age=5");
  });

  it("uses the Cache-Control the project chose for an asset", async () => {
    const page = await site.get("/");
    const href = page.body.match(/href="(\/_astro\/[^"]+\.css)"/)?.[1];
    assert.ok(href, "the page links no stylesheet");

    const asset = await site.get(href);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get("cache-control"), "public, max-age=600");
  });

  it("still serves the whole site", async () => {
    assert.equal((await site.get("/")).status, 200);
    assert.equal((await site.get("/about")).status, 200);
    assert.equal((await site.get("/nothing-is-here")).status, 404);
  });
});
