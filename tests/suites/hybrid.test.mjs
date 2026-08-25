/**
 * A project that leaves `output` alone, and has routes that render per request.
 *
 * Since Astro 5 this is the default shape: pages are prerendered, and a page
 * opts out with `export const prerender = false`. The adapter used to read
 * `output` to decide whether a server was needed. On a project like this one it
 * answered "no", wrote a manifest that named no script, and `bunny sites deploy`
 * uploaded the files alone. The site went up with every dynamic route missing,
 * and nothing said so. That is what this suite is here to stop.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("hybrid", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("hybrid");
  });
  after(() => site?.close());

  it("tells the CLI a server has to be deployed", () => {
    const manifest = site.manifest();
    assert.equal(manifest.kind, "ssr");
    assert.equal(manifest.script?.entry, "dist/index.js");
    assert.ok(manifest.script.bytes > 0);
  });

  // Astro reports this build as a server build, and the adapter hands that
  // answer back. Reading `config.output` instead reported a static build here,
  // and the deploy went up with every dynamic route missing.
  it("builds a server, and never says the site needs none", () => {
    assert.ok(site.hasBundle(), "the build wrote no script");
    assert.match(site.log, /Bundled to dist\/index\.js/);
    assert.doesNotMatch(site.log, /deploys no script/);
  });

  it("prerenders the page that did not opt out", async () => {
    const files = await site.files();
    assert.ok(files.includes("index.html"), `index.html is missing from ${files.join(", ")}`);
    assert.ok(!files.some((file) => file.startsWith("live")), "the on-demand page was prerendered");
  });

  it("serves the prerendered page out of Storage, unchanged", async () => {
    const first = await site.get("/");
    assert.equal(first.status, 200);
    const second = await site.get("/");
    assert.equal(textOf(first.body, "built-at"), textOf(second.body, "built-at"));
  });

  it("renders the on-demand page again for every request", async () => {
    const first = await site.get("/live?name=first");
    assert.equal(first.status, 200);
    assert.equal(textOf(first.body, "greeting"), "first");

    const second = await site.get("/live?name=second");
    assert.equal(textOf(second.body, "greeting"), "second");
    assert.notEqual(
      textOf(first.body, "rendered-at"),
      textOf(second.body, "rendered-at"),
      "the page was not rendered again",
    );
  });

  it("runs an on-demand endpoint", async () => {
    const response = await site.get("/api/now");
    assert.equal(response.status, 200);
    assert.ok(JSON.parse(response.body).now > 0);
  });
});
