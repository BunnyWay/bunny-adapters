/**
 * A content collection, read at build time and inside the script.
 *
 * Astro bundles the collection data into the server output. If a chunk of that
 * data does not survive the esbuild step, the page renders with nothing on it
 * and no error anywhere.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("content", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("content");
  });
  after(() => site?.close());

  it("prerenders one page per entry", async () => {
    const files = await site.files();
    for (const expected of ["notes/first/index.html", "notes/second/index.html"]) {
      assert.ok(files.includes(expected), `${expected} is missing from ${files.join(", ")}`);
    }
  });

  it("reads the collection inside the script", async () => {
    const page = await site.get("/");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "count"), "2");
  });

  it("keeps the order the page asked for", async () => {
    const page = await site.get("/");
    const first = page.body.indexOf("The first note");
    const second = page.body.indexOf("The second note");
    assert.ok(first > -1 && second > first, "the notes are missing or out of order");
  });

  it("renders the markdown of an entry", async () => {
    const page = await site.get("/notes/first");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "title"), "The first note");
    assert.match(page.body, /<strong>rendered from markdown<\/strong>/);
  });

  it("gives an entry that does not exist the 404 page", async () => {
    const page = await site.get("/notes/third");
    assert.equal(page.status, 404);
    assert.equal(textOf(page.body, "not-found"), "nothing here");
  });

  it("links every entry to a page that answers", async () => {
    const page = await site.get("/");
    const links = [...page.body.matchAll(/href="(\/notes\/[^"]+)"/g)].map((match) => match[1]);
    assert.equal(links.length, 2, `found ${links.length} links`);
    for (const href of links) {
      assert.equal((await site.get(href)).status, 200, `${href} does not answer`);
    }
  });
});
