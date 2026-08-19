/**
 * Range and conditional requests on an object in Bunny Storage.
 *
 * A pull zone will not answer a range from its cache, and will not slice a
 * large object with **Optimize for large object delivery**, unless the origin
 * says it accepts ranges. The script is the origin. So a script that always
 * answers 200 with the whole object makes a large file seekable only after it
 * is fully cached, and a video player has to download everything to skip
 * ahead.
 *
 * Bunny Storage answers ranges and conditional requests itself, so the script
 * passes them straight through and never reads more than it sends.
 *
 * @see https://bunny.net/docs/cdn/frequently-asked-questions/range-requests
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture } from "../harness.mjs";

const SIZE = 65_536;

/** Byte `n` of the fixture file. It is generated, so any slice is checkable. */
const byteAt = (index) => index % 251;

/** Fetch a byte range, and return the bytes rather than the text. */
async function fetchRange(baseUrl, path, headers) {
  const response = await fetch(new URL(path, baseUrl), { headers });
  return {
    status: response.status,
    headers: response.headers,
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

describe("ranges", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("ranges");
  });
  after(() => site?.close());

  it("says it accepts ranges, which is what lets the pull zone slice", async () => {
    const whole = await site.get("/big.bin");
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get("accept-ranges"), "bytes");
  });

  it("says it accepts ranges on a page too", async () => {
    const page = await site.get("/about");
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("accept-ranges"), "bytes");
  });

  it("names the length of a whole object", async () => {
    const whole = await site.get("/big.bin");
    assert.equal(whole.headers.get("content-length"), String(SIZE));
  });

  it("answers a range with 206 and only those bytes", async () => {
    const part = await fetchRange(site.baseUrl, "/big.bin", { range: "bytes=100-199" });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get("content-range"), `bytes 100-199/${SIZE}`);
    assert.equal(part.headers.get("content-length"), "100");
    assert.equal(part.bytes.length, 100);
  });

  it("sends the bytes the range asked for, not the first ones", async () => {
    const part = await fetchRange(site.baseUrl, "/big.bin", { range: "bytes=1000-1009" });
    assert.equal(part.status, 206);
    assert.deepEqual(
      [...part.bytes],
      Array.from({ length: 10 }, (_, index) => byteAt(1000 + index)),
    );
  });

  it("answers an open-ended range", async () => {
    const part = await fetchRange(site.baseUrl, "/big.bin", { range: "bytes=65500-" });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get("content-range"), `bytes 65500-${SIZE - 1}/${SIZE}`);
    assert.equal(part.bytes.length, 36);
  });

  it("answers a range counted from the end", async () => {
    const part = await fetchRange(site.baseUrl, "/big.bin", { range: "bytes=-50" });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get("content-range"), `bytes ${SIZE - 50}-${SIZE - 1}/${SIZE}`);
    assert.equal(part.bytes.length, 50);
  });

  it("keeps the content type on a partial answer", async () => {
    // The type comes from the object's extension, not from what Storage said,
    // and a 206 needs it as much as a 200 does.
    const part = await fetchRange(site.baseUrl, "/big.bin", { range: "bytes=0-9" });
    assert.equal(part.headers.get("content-type"), "application/octet-stream");

    const page = await fetchRange(site.baseUrl, "/about", { range: "bytes=0-9" });
    assert.equal(page.status, 206);
    assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  });

  it("refuses a range that is not there", async () => {
    const part = await fetchRange(site.baseUrl, "/big.bin", { range: "bytes=999999-" });
    assert.equal(part.status, 416);
    assert.equal(part.headers.get("content-range"), `bytes */${SIZE}`);
    assert.equal(part.bytes.length, 0);
  });

  it("refuses every method but GET and HEAD", async () => {
    // A stored object is read-only. Answering 200 with the whole file to a
    // DELETE is wrong, and it spends origin bandwidth on a request that should
    // have cost one header.
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const page = await site.get("/big.bin", { method });
      assert.equal(page.status, 405, `${method} answered ${page.status}`);
      assert.equal(page.headers.get("allow"), "GET, HEAD");
      assert.equal(page.body, "");
    }
  });

  it("still lets an unknown path reach the 404 page, whatever the method", async () => {
    // The refusal must come after the object is known to be there. Otherwise a
    // POST to any unknown path answers 405 instead of the site's own 404.
    const page = await site.get("/nothing-is-here", {
      method: "POST",
      headers: { accept: "text/html" },
    });
    assert.equal(page.status, 404);
  });

  it("serves the whole object for a range header it does not understand", async () => {
    const part = await fetchRange(site.baseUrl, "/big.bin", { range: "pages=1-2" });
    assert.equal(part.status, 200);
    assert.equal(part.bytes.length, SIZE);
  });

  it("lets the browser revalidate instead of downloading again", async () => {
    const whole = await site.get("/big.bin");
    const etag = whole.headers.get("etag");
    const modified = whole.headers.get("last-modified");
    assert.ok(etag || modified, "the answer carries neither an ETag nor a Last-Modified");

    const again = await site.get("/big.bin", {
      headers: etag ? { "if-none-match": etag } : { "if-modified-since": modified },
    });
    assert.equal(again.status, 304);
    assert.equal(again.body, "", "a 304 carried a body");
    assert.equal(again.headers.get("content-length"), null, "a 304 named a length");
  });

  it("answers HEAD with the length and no body", async () => {
    const head = await site.get("/big.bin", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.body, "");
    assert.equal(head.headers.get("content-length"), String(SIZE));
    assert.equal(head.headers.get("accept-ranges"), "bytes");
  });

  it("still says how the object may be cached", async () => {
    const part = await fetchRange(site.baseUrl, "/big.bin", { range: "bytes=0-9" });
    assert.match(part.headers.get("cache-control") ?? "", /max-age/);
  });

  it("leaves a rendered route alone, because Astro owns it", async () => {
    // Only a stored object is fetched in pieces. A rendered page has no bytes
    // on disk to slice, and Astro decides what its answer is.
    const page = await fetchRange(site.baseUrl, "/", { range: "bytes=0-9" });
    assert.equal(page.status, 200);
  });
});
