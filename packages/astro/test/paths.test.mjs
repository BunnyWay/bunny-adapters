import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  normalizeBase,
  objectCandidates,
  resolveObject,
  storageBase,
  stripBase,
  toObjectPath,
} from "../dist/runtime/paths.js";

describe("toObjectPath", () => {
  it("drops the leading slash", () => {
    assert.equal(toObjectPath("/_astro/app.css"), "_astro/app.css");
    assert.equal(toObjectPath("///a/b"), "a/b");
  });

  it("decodes a percent-encoded path", () => {
    assert.equal(toObjectPath("/my%20folder/a.png"), "my folder/a.png");
  });

  it("keeps a malformed escape rather than throwing", () => {
    assert.equal(toObjectPath("/%C0%AF"), "%C0%AF");
  });

  it("removes every traversal segment", () => {
    assert.equal(toObjectPath("/../../etc/passwd"), "etc/passwd");
    assert.equal(toObjectPath("/a/../../../b"), "a/b");
    assert.equal(toObjectPath("/a/./b"), "a/b");
    // The encoded form is the one a scanner actually sends.
    assert.equal(toObjectPath("/%2e%2e/%2e%2e/etc/passwd"), "etc/passwd");
  });

  it("returns an empty string for the site root", () => {
    assert.equal(toObjectPath("/"), "");
  });
});

describe("objectCandidates", () => {
  it("serves the root as index.html", () => {
    assert.deepEqual(objectCandidates("/"), ["index.html"]);
  });

  it("treats a path with an extension as one asset", () => {
    assert.deepEqual(objectCandidates("/_astro/app.css"), ["_astro/app.css"]);
  });

  it("offers both build formats for a page", () => {
    assert.deepEqual(objectCandidates("/about"), ["about/index.html", "about.html"]);
    assert.deepEqual(objectCandidates("/blog/post"), ["blog/post/index.html", "blog/post.html"]);
  });

  it("cannot escape the zone", () => {
    // The traversal is gone, and what is left is looked for as a page.
    assert.deepEqual(objectCandidates("/../../etc/passwd"), [
      "etc/passwd/index.html",
      "etc/passwd.html",
    ]);
  });
});

describe("resolveObject", () => {
  const assets = new Set(["index.html", "about/index.html", "404.html", "_astro/app.css"]);

  it("finds a page written as a folder", () => {
    assert.equal(resolveObject("/about", assets), "about/index.html");
  });

  it("finds a page written as a file", () => {
    assert.equal(resolveObject("/404", assets), "404.html");
  });

  it("finds an asset", () => {
    assert.equal(resolveObject("/_astro/app.css", assets), "_astro/app.css");
  });

  it("returns null for something the build never made", () => {
    assert.equal(resolveObject("/nothing", assets), null);
    assert.equal(resolveObject("/_astro/gone.css", assets), null);
  });
});

describe("storageBase", () => {
  it("adds HTTPS to a bare hostname", () => {
    assert.equal(storageBase("storage.bunnycdn.com"), "https://storage.bunnycdn.com");
    assert.equal(storageBase("ny.storage.bunnycdn.com"), "https://ny.storage.bunnycdn.com");
  });

  it("keeps a scheme that is already there", () => {
    assert.equal(storageBase("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
    assert.equal(storageBase("https://example.test/"), "https://example.test");
  });

  it("ignores surrounding whitespace and a trailing slash", () => {
    assert.equal(storageBase("  storage.bunnycdn.com/  "), "https://storage.bunnycdn.com");
  });
});

describe("normalizeBase", () => {
  it("gives the site root an empty prefix, which costs no comparison", () => {
    assert.equal(normalizeBase("/"), "");
    assert.equal(normalizeBase(""), "");
    assert.equal(normalizeBase(undefined), "");
  });

  it("accepts every shape Astro allows", () => {
    assert.equal(normalizeBase("/docs"), "/docs");
    assert.equal(normalizeBase("docs"), "/docs");
    assert.equal(normalizeBase("/docs/"), "/docs");
    assert.equal(normalizeBase(" /docs/ "), "/docs");
  });

  it("keeps a prefix of more than one segment", () => {
    assert.equal(normalizeBase("/a/b"), "/a/b");
  });
});

describe("stripBase", () => {
  it("changes nothing when the site has no base", () => {
    assert.equal(stripBase("/about", ""), "/about");
  });

  it("removes the prefix", () => {
    assert.equal(stripBase("/docs/about", "/docs"), "/about");
    assert.equal(stripBase("/docs/_astro/app.css", "/docs"), "/_astro/app.css");
  });

  it("reads the base itself as the site root", () => {
    assert.equal(stripBase("/docs", "/docs"), "/");
    assert.equal(stripBase("/docs/", "/docs"), "/");
  });

  it("refuses a path outside the base, which belongs to no object", () => {
    assert.equal(stripBase("/about", "/docs"), null);
    assert.equal(stripBase("/", "/docs"), null);
  });

  it("does not treat a longer name as the base", () => {
    // "/docsearch" starts with "/docs", and it is a different path.
    assert.equal(stripBase("/docsearch/x", "/docs"), null);
  });
});
