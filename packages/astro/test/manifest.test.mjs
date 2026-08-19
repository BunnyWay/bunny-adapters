import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildManifest, headersByObject, listFiles } from "../dist/build/manifest.js";

/** Astro's `routeToHeaders`: a map from route pathname to its headers. */
function routeHeaders(entries) {
  return new Map(
    entries.map(([pathname, headers]) => [pathname, { headers: new Headers(headers), route: {} }]),
  );
}

async function fixture(files) {
  const dir = await mkdtemp(path.join(tmpdir(), "bunny-manifest-"));
  for (const [name, body] of Object.entries(files)) {
    const target = path.join(dir, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  return dir;
}

describe("listFiles", () => {
  it("lists every file as a POSIX path", async () => {
    const dir = await fixture({
      "index.html": "a",
      "_astro/app.css": "b",
      "blog/post/index.html": "c",
    });
    assert.deepEqual((await listFiles(dir)).sort(), [
      "_astro/app.css",
      "blog/post/index.html",
      "index.html",
    ]);
  });

  it("returns nothing for a folder that is not there", async () => {
    assert.deepEqual(await listFiles("/tmp/definitely-not-a-build-output"), []);
  });
});

describe("headersByObject", () => {
  it("registers both build formats, because either could be on disk", () => {
    const result = headersByObject(
      routeHeaders([["/about", { "content-security-policy": "default-src 'self'" }]]),
    );
    assert.deepEqual(Object.keys(result).sort(), ["about.html", "about/index.html"]);
    assert.deepEqual(result["about.html"], [["content-security-policy", "default-src 'self'"]]);
  });

  it("drops the content type, which the script works out itself", () => {
    // Astro's plain `text/html` would lose the charset the script adds.
    const result = headersByObject(routeHeaders([["/about", { "content-type": "text/html" }]]));
    assert.deepEqual(result, {});
  });

  it("skips a route with no headers", () => {
    assert.deepEqual(headersByObject(routeHeaders([["/about", {}]])), {});
  });
});

describe("buildManifest", () => {
  it("inlines the file list and the headers", async () => {
    const dir = await fixture({ "index.html": "a", "404.html": "b" });
    const manifest = await buildManifest(
      pathToFileURL(dir + "/"),
      routeHeaders([["/404", { "x-robots-tag": "noindex" }]]),
      100,
    );
    assert.deepEqual(manifest.assets, ["404.html", "index.html"]);
    assert.deepEqual(manifest.headers["404.html"], [["x-robots-tag", "noindex"]]);
  });

  it("gives up above the limit, so the bundle stays small", async () => {
    const dir = await fixture({ "a.html": "a", "b.html": "b", "c.html": "c" });
    const manifest = await buildManifest(pathToFileURL(dir + "/"), null, 2);
    assert.equal(manifest.assets, null);
  });

  it("holds no headers when there are none", async () => {
    const dir = await fixture({ "index.html": "a" });
    const manifest = await buildManifest(pathToFileURL(dir + "/"), null, 100);
    assert.equal(manifest.headers, null);
  });
});
