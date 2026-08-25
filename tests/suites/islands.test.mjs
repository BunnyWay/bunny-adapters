/**
 * A framework island that hydrates in the browser, and a server island that
 * renders after the page around it is sent.
 *
 * The adapter does not own hydration. It owns the two things hydration needs:
 * the client bundle has to come out of Bunny Storage with a content type a
 * browser will run, and the server island endpoint has to reach Astro.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

/**
 * Every hashed module the page needs to hydrate an island.
 *
 * Astro names them on the `<astro-island>` element, not in a `<script src>`.
 * Each one has to be in Bunny Storage, or the island never comes alive and the
 * page shows no error at all.
 */
function islandModules(html) {
  const urls = [...html.matchAll(/(?:component-url|renderer-url)="([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(urls)];
}

describe("islands", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("islands");
  });
  after(() => site?.close());

  it("builds the client bundle into dist/client", async () => {
    const files = await site.files();
    const scripts = files.filter((file) => file.startsWith("_astro/") && file.endsWith(".js"));
    assert.ok(scripts.length > 0, `no client script in ${files.join(", ")}`);
  });

  it("puts the island on a rendered page, with its props", async () => {
    const page = await site.get("/");
    assert.equal(page.status, 200);
    assert.match(page.body, /<astro-island/, "no island on the page");
    assert.match(page.body, /41/, "the island lost its props");
  });

  it("serves the client bundle with a type the browser will run", async () => {
    const page = await site.get("/");
    const modules = islandModules(page.body);
    assert.ok(modules.length >= 2, `the page names only ${modules.join(", ")}`);

    for (const url of modules) {
      const script = await site.get(url);
      assert.equal(script.status, 200, `${url} answered ${script.status}`);
      assert.ok(
        script.headers.get("content-type").startsWith("text/javascript"),
        `${url} came back as ${script.headers.get("content-type")}`,
      );
      assert.match(script.headers.get("cache-control"), /immutable/);
    }
  });

  it("serves every module the client bundle imports", async () => {
    // A hashed name that Storage does not hold means the deploy missed a file,
    // and the island silently never hydrates.
    const page = await site.get("/");
    let found = 0;

    for (const url of islandModules(page.body)) {
      const bundle = await site.get(url);
      const imports = [...bundle.body.matchAll(/from\s*["'](\.[^"']+\.js)["']/g)].map((m) => m[1]);
      for (const relative of imports) {
        const resolved = new URL(relative, `http://x${url}`).pathname;
        const module = await site.get(resolved);
        assert.equal(module.status, 200, `${resolved} answered ${module.status}`);
        found++;
      }
    }
    assert.ok(found > 0, "no island module imports another, so nothing was checked");
  });

  it("renders a server island through its own endpoint", async () => {
    const page = await site.get("/");
    const url = page.body.match(/href="(\/_server-islands\/[^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    assert.ok(url, "the page holds no server island request");

    const island = await site.get(url);
    assert.equal(island.status, 200);
    assert.ok(island.headers.get("content-type").startsWith("text/html"));
    assert.ok(textOf(island.body, "deferred"), "the island rendered nothing");
  });

  it("hydrates an island on a prerendered page too", async () => {
    const page = await site.get("/static");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "prerendered"), "yes");
    assert.match(page.body, /<astro-island/, "no island on the stored page");

    const modules = islandModules(page.body);
    assert.ok(modules.length >= 2, `the stored page names only ${modules.join(", ")}`);
    for (const url of modules) {
      assert.equal((await site.get(url)).status, 200, `${url} is not in Storage`);
    }
  });
});
