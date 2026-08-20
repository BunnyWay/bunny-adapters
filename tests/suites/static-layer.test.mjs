/**
 * The two things a static Astro build cannot say for itself.
 *
 * A prerendered site goes up as files, and the `bunny sites` router serves
 * them. The router reads `_redirects` and `_headers`, the file names Cloudflare
 * Pages and Netlify read, and it reads nothing shaped like Astro. So the build
 * writes those two files: one carries the redirects with a real status, and one
 * carries the headers Bunny Storage cannot hold.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";
import { buildFixture } from "../harness.mjs";

describe("static-layer", () => {
  /** @type {Awaited<ReturnType<typeof buildFixture>>} */
  let site;

  before(async () => {
    site = await buildFixture("static-layer");
  });

  it("deploys files, although it has redirects and a 404 page", () => {
    const manifest = site.manifest();
    assert.equal(manifest.kind, "static");
    assert.equal(manifest.script, undefined);
    assert.ok(!site.hasBundle(), "the build wrote dist/index.js");
  });

  it("names both files in the log", () => {
    assert.match(site.log, /Wrote _redirects and _headers into dist\/client/);
  });

  it("writes every redirect, with the status the route asked for", () => {
    const redirects = site.read("_redirects");
    // `!` forces the rule over the meta-refresh page Astro wrote at the same
    // path. Without it that page answers 200, and the visitor gets a `<meta>`
    // tag instead of a `Location` header.
    assert.match(redirects, /^\/old\/? \/about 301!$/m);
    assert.match(redirects, /^\/gone\/? \/about 302!$/m);
    assert.match(redirects, /^\/away\/? https:\/\/example\.com\/ 301!$/m);
  });

  // Astro writes the page all the same, so a deploy that never reaches the
  // router still sends the visitor on. The router's 301 is the better answer,
  // and the forced rule is what makes it win.
  it("leaves Astro's own redirect page in place", async () => {
    const files = await site.files();
    assert.ok(files.includes("old/index.html"), `old/index.html is missing from ${files}`);
    assert.match(site.read("old/index.html"), /http-equiv="refresh"/);
  });

  it("writes the content security policy Storage cannot hold", () => {
    const headers = site.read("_headers");
    assert.match(headers, /^\/about\/?$/m);
    assert.match(headers, /^ {2}content-security-policy: .*script-src/im);
  });

  // The router works the content type out from the object's extension, and its
  // answer carries a charset. Astro's plain `text/html` would lose it.
  it("writes no content type, and no length", () => {
    const headers = site.read("_headers");
    assert.doesNotMatch(headers, /content-type/i);
    assert.doesNotMatch(headers, /content-length/i);
  });

  it("still writes the asset cache rule", () => {
    assert.match(site.read("_headers"), /^\/_astro\/\*$/m);
  });
});
