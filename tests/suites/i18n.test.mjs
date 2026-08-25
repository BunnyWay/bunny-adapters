/**
 * Locale routing.
 *
 * Astro owns the routes, and the script has to find the prerendered page for
 * each locale in Storage. A locale prefix looks a lot like a `base` prefix, so
 * this fixture also proves the script does not confuse the two.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("i18n", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("i18n");
  });
  after(() => site?.close());

  it("prerenders a page per locale", async () => {
    const files = await site.files();
    for (const expected of ["en/index.html", "fr/index.html"]) {
      assert.ok(files.includes(expected), `${expected} is missing from ${files.join(", ")}`);
    }
  });

  it("serves the default locale out of Storage", async () => {
    const page = await site.get("/en/");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "greeting"), "Hello");
  });

  it("serves the other locale out of Storage", async () => {
    const page = await site.get("/fr/");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "greeting"), "Bonjour");
  });

  it("serves a locale page with no trailing slash too", async () => {
    const page = await site.get("/fr");
    assert.ok([200, 301, 302, 307, 308].includes(page.status), `status ${page.status}`);
  });

  it("gives the bare root the 404 page, which is what Astro decides", async () => {
    // With prefixDefaultLocale, Astro builds no route for "/", and `astro dev`
    // answers 404 there too. The adapter must reach the 404 page and not fail.
    const page = await site.get("/");
    assert.equal(page.status, 404);
    assert.equal(textOf(page.body, "not-found"), "nothing here");
  });

  it("renders an on-demand page inside a locale", async () => {
    const page = await site.get("/en/live");
    assert.equal(page.status, 200);
    assert.ok(textOf(page.body, "rendered-at"), "the page did not render");
    assert.equal(textOf(page.body, "locale"), "en");
  });

  it("gives an unknown locale the 404 page", async () => {
    const page = await site.get("/de/");
    assert.equal(page.status, 404);
    assert.equal(textOf(page.body, "not-found"), "nothing here");
  });
});
