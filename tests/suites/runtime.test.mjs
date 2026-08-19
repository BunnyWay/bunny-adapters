/**
 * What every project needs from the runtime, whatever else it configures.
 *
 * These are the checks the Netlify and Cloudflare suites keep in one place too:
 * cookies, streams, request bodies, secrets, methods, and the headers the edge
 * adds. None of them belongs to one feature, and all of them break a site.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("runtime", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("runtime", {
      env: { FIXTURE_SECRET: "from-the-script", FIXTURE_UNLISTED: "also-readable" },
    });
  });
  after(() => site?.close());

  it("sends two cookies as two headers", async () => {
    // One joined header breaks both, because a cookie value may hold a comma.
    const answer = await site.get("/api/cookies");
    const cookies = answer.headers.getSetCookie();
    assert.equal(cookies.length, 2, `got ${JSON.stringify(cookies)}`);
    assert.ok(cookies.some((value) => value.startsWith("first=one")));
    assert.ok(cookies.some((value) => value.startsWith("second=two")));
    assert.ok(
      cookies.some((value) => /httponly/i.test(value)),
      "HttpOnly was dropped",
    );
  });

  it("sends a streamed body whole", async () => {
    const answer = await site.get("/api/stream");
    assert.equal(answer.status, 200);
    assert.equal(answer.body, "chunk-1\nchunk-2\nchunk-3\nchunk-4\nchunk-5\n");
  });

  it("sends a stream in pieces, rather than buffering it", async () => {
    // A page that streams its answer is the whole point of streaming, and an
    // adapter that reads the body first would still pass the check above.
    const response = await fetch(new URL("/api/stream", site.baseUrl));
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.ok(first.value.length > 0, "the first chunk was empty");
    assert.ok(first.value.length < 40, "the whole body arrived in one piece");
    await reader.cancel();
  });

  it("takes a large text body whole", async () => {
    const body = "x".repeat(100_000);
    const answer = await site.get("/api/echo", {
      method: "POST",
      headers: { origin: site.baseUrl, "content-type": "text/plain" },
      body,
    });
    assert.equal(answer.status, 200);
    assert.equal(JSON.parse(answer.body).bytes, 100_000);
  });

  it("takes a binary body without changing a byte", async () => {
    const bytes = new Uint8Array(1024);
    for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256;
    const expected = bytes.reduce((sum, byte) => sum + byte, 0);

    const answer = await site.get("/api/binary", {
      method: "POST",
      headers: { origin: site.baseUrl, "content-type": "application/octet-stream" },
      body: bytes,
    });
    assert.equal(answer.status, 200);
    assert.deepEqual(JSON.parse(answer.body), { length: 1024, sum: expected });
  });

  it("keeps the request method", async () => {
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      const answer = await site.get("/api/echo", {
        method,
        headers: { origin: site.baseUrl, "content-type": "text/plain" },
        body: method === "DELETE" ? undefined : "x",
      });
      assert.equal(answer.status, 200, `${method} answered ${answer.status}`);
      assert.equal(JSON.parse(answer.body).method, method);
    }
  });

  it("reads a secret the schema declares", async () => {
    const answer = await site.get("/api/secret");
    assert.equal(JSON.parse(answer.body).fromSchema, "from-the-script");
  });

  it("reads a variable the schema does not declare", async () => {
    // getSecret is the escape hatch for a variable added after the build.
    const answer = await site.get("/api/secret");
    assert.equal(JSON.parse(answer.body).unlisted, "also-readable");
  });

  it("keeps the query string exactly as it arrived", async () => {
    const answer = await site.get("/api/query?name=a%20b&empty=&repeat=1&repeat=2");
    const body = JSON.parse(answer.body);
    assert.equal(body.name, "a b");
    assert.equal(body.raw, "?name=a%20b&empty=&repeat=1&repeat=2");
  });

  it("sends a header the route set twice, twice", async () => {
    const answer = await site.get("/api/headers");
    assert.equal(answer.headers.get("x-fixture"), "one, two");
  });

  it("puts what the edge knows on Astro.locals.runtime", async () => {
    const page = await site.get("/", {
      headers: { "cdn-requestcountrycode": "SI", "cdn-requestid": "abc123" },
    });
    assert.equal(textOf(page.body, "country"), "SI");
    assert.equal(textOf(page.body, "request-id"), "abc123");
  });

  it("reads the visitor address from the forwarded header", async () => {
    const page = await site.get("/", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
    assert.equal(textOf(page.body, "client-address"), "203.0.113.7");
  });

  it("gives Astro.clientAddress an answer even with no header", async () => {
    // Astro.clientAddress throws when the adapter hands it nothing, so a page
    // would fail rather than show an unknown address.
    const page = await site.get("/");
    assert.ok(textOf(page.body, "client-address"), "clientAddress is empty");
  });

  it("never leaves a rendered response cacheable by accident", async () => {
    // A pull zone applies its own expiration to a response with no directive,
    // which would hand one visitor's page to the next.
    for (const path of ["/", "/api/cookies", "/api/stream", "/api/headers"]) {
      const value = (await site.get(path)).headers.get("cache-control") ?? "";
      assert.match(value, /no-store/, `${path} answered "${value}"`);
    }
  });

  it("answers HEAD on a rendered route without a body", async () => {
    const page = await site.get("/", { method: "HEAD" });
    assert.equal(page.status, 200);
    assert.equal(page.body, "");
  });

  it("refuses a method the route does not define", async () => {
    const answer = await site.get("/api/query", {
      method: "POST",
      headers: { origin: site.baseUrl },
    });
    assert.ok([404, 405].includes(answer.status), `status ${answer.status}`);
  });
});
