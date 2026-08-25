/**
 * Astro actions.
 *
 * An action is a POST endpoint under `/_actions`, and it answers with a devalue
 * payload rather than JSON. The form flavour posts to the page itself and needs
 * the result back on the next render, which only works if cookies survive the
 * round trip.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { serveFixture, textOf } from "../harness.mjs";

describe("actions", () => {
  /** @type {Awaited<ReturnType<typeof serveFixture>>} */
  let site;

  before(async () => {
    site = await serveFixture("actions");
  });
  after(() => site?.close());

  const post = (path, body, headers = {}) =>
    site.get(path, {
      method: "POST",
      headers: { origin: site.baseUrl, ...headers },
      body,
    });

  it("answers a JSON action", async () => {
    const answer = await post("/_actions/greet", JSON.stringify({ name: "Bunny" }), {
      "content-type": "application/json",
    });
    assert.equal(answer.status, 200);
    assert.match(answer.body, /Hello, Bunny!/);
  });

  it("refuses input the action rejects", async () => {
    const answer = await post("/_actions/greet", JSON.stringify({ name: "" }), {
      "content-type": "application/json",
    });
    assert.equal(answer.status, 400);
  });

  it("has nothing to say about an action that does not exist", async () => {
    const answer = await post("/_actions/missing", JSON.stringify({}), {
      "content-type": "application/json",
    });
    assert.equal(answer.status, 404);
    assert.ok(!/<html/i.test(answer.body), "an HTML page came back from an action");
  });

  it("takes a form POST and shows the result on the page", async () => {
    const form = new URLSearchParams({ name: "Bunny" });
    const sent = await post("/_actions/fromForm", form.toString(), {
      "content-type": "application/x-www-form-urlencoded",
    });

    // Astro answers a form action with a redirect back to the page, and it
    // carries the result in a cookie.
    assert.ok([200, 303].includes(sent.status), `status ${sent.status}`);

    if (sent.status === 303) {
      const cookie = (sent.headers.get("set-cookie") ?? "").split(";")[0];
      assert.ok(cookie, "no cookie carried the result");
      const back = await site.get(sent.headers.get("location") ?? "/", { headers: { cookie } });
      assert.equal(textOf(back.body, "form-result"), "Hello, Bunny!");
    } else {
      assert.match(sent.body, /Hello, Bunny!/);
    }
  });

  it("leaves the page itself alone", async () => {
    const page = await site.get("/");
    assert.equal(page.status, 200);
    assert.equal(textOf(page.body, "form-result"), "none");
  });

  it("says how an action answer may be cached", async () => {
    const answer = await post("/_actions/greet", JSON.stringify({ name: "Bunny" }), {
      "content-type": "application/json",
    });
    assert.match(answer.headers.get("cache-control") ?? "", /no-store/);
  });
});
