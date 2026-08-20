/**
 * A deploy that lives in its own folder in the zone.
 *
 * `bunny deploy` uploads each build to `deploys/{id}/` and writes that name into
 * the top of the bundle, so a published release can only read the files it was
 * built with. That is what makes a rollback restore a page and its assets
 * together. This suite proves the script really looks there, and nowhere else.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture } from "../harness.mjs";

const PREFIX = "deploys/a1b2c3d4";

describe("deploy-prefix", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    // The zone holds `deploys/a1b2c3d4/...` and nothing at its root, exactly as
    // a deployed site's zone does.
    site = await serveFixture("deploy-prefix", { assetPrefix: PREFIX });
  });
  after(() => site?.close());

  it("serves a prerendered page out of the deploy's folder", async () => {
    const page = await site.get("/about");
    assert.equal(page.status, 200);
    assert.match(page.body, /<html/);
  });

  it("looked only inside the deploy's folder", async () => {
    await site.get("/about");
    const outside = site.zone.requests.filter(
      (request) => !request.startsWith(`/fixture/${PREFIX}/`),
    );
    assert.deepEqual(outside, [], `these requests left the deploy: ${outside.join(", ")}`);
  });

  it("still answers a path the build never produced", async () => {
    const missing = await site.get("/nothing-here");
    assert.equal(missing.status, 404);
  });

  it("serves the site root", async () => {
    const home = await site.get("/");
    assert.equal(home.status, 200);
    assert.match(home.body, /<html/);
  });
});
