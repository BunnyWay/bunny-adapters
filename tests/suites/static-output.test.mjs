/**
 * A site with nothing rendered on demand deploys no script at all.
 *
 * This fixture has a 404 page, and that used to be enough to pull the whole
 * Astro server along: Bunny Storage cannot answer a missing object with a page,
 * so the script did it. The `bunny sites` router does it now, for every static
 * framework, so a site with no server carries no server. The build says so, and
 * writes nothing but files.
 */
import { strict as assert } from "node:assert";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { before, describe, it } from "node:test";
import { preview } from "astro";
import { buildFixture } from "../harness.mjs";
import { freePort } from "../runner.mjs";

describe("static-output", () => {
  /** @type {Awaited<ReturnType<typeof buildFixture>>} */
  let site;

  before(async () => {
    site = await buildFixture("static-output");
  });

  it("prerenders every page", async () => {
    const files = await site.files();
    for (const expected of ["index.html", "about/index.html", "404.html"]) {
      assert.ok(files.includes(expected), `${expected} is missing from ${files.join(", ")}`);
    }
  });

  it("tells the CLI to deploy the files, and names no script", () => {
    const manifest = site.manifest();
    assert.equal(manifest.kind, "static");
    assert.equal(manifest.script, undefined);
    assert.equal(manifest.assets.dir, "dist/client");
  });

  // Astro builds no server entry for a static build, so there is nothing to
  // bundle and nothing to deploy. A bundle here would be a megabyte of server
  // for a site that renders nothing.
  it("builds no script, and no server output", () => {
    assert.ok(!site.hasBundle(), "the build wrote dist/index.js");
    const serverDir = path.join(site.dist, "server");
    assert.ok(
      !existsSync(serverDir) || readdirSync(serverDir).length === 0,
      "dist/server holds files",
    );
  });

  it("says the site needs no script, and no adapter", () => {
    assert.match(site.log, /Every route is prerendered/);
    assert.match(site.log, /deploys no script/);
    assert.match(site.log, /Nothing here needs the adapter/);
    // The one case the route list cannot see.
    assert.match(site.log, /server:defer/);
  });

  // The router will not guess which directory holds hashed files, so the build
  // says which one it is, in the file both Cloudflare and Netlify read.
  it("writes the asset cache rule into _headers", async () => {
    const files = await site.files();
    assert.ok(files.includes("_headers"), "_headers is missing");
    const headers = site.read("_headers");
    assert.match(headers, /^\/_astro\/\*$/m);
    assert.match(headers, /^ {2}Cache-Control: public, max-age=31536000, immutable$/m);
  });

  it("writes no _redirects, because this site has none", async () => {
    const files = await site.files();
    assert.ok(!files.includes("_redirects"), "_redirects was written for a site with no redirect");
  });

  // With no script to run, the adapter declares no preview entrypoint, and
  // Astro serves `dist/client` from its own static server. Nothing here needs
  // Deno, because nothing here is deployed to Deno.
  it("previews through Astro's own static server", async () => {
    const server = await preview({
      root: site.dir,
      server: { port: await freePort() },
      logLevel: "error",
    });
    try {
      // `dist/client`, because the adapter asks Astro to keep that folder even
      // for a static build. The deploy uploads one directory, and every build
      // has to name the same one.
      for (const pathname of ["/", "/about/", "/robots.txt"]) {
        const page = await fetch(`http://localhost:${server.port}${pathname}`);
        assert.equal(page.status, 200, `${pathname} answered ${page.status}`);
      }
    } finally {
      await server.stop();
    }
  });
});
