/**
 * What this site must do.
 *
 * Each entry matches one page of the showcase, so the demo and the test suite
 * cannot drift apart. The same list runs twice: against the bundle on Deno
 * behind a local storage zone, and against a real deployment.
 *
 * A check receives:
 *   get(path, init)  fetch the site, returning { status, body, headers }
 *   assert(ok, why)  fail the check
 *   mode             "local" or "live"
 */

/** The text inside the element with this id. Enough for a fixture page. */
export function textOf(html, id) {
  const pattern = new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)<`, "i");
  return html.match(pattern)?.[1]?.trim();
}

/** The value of an attribute on the element with this id. */
export function attrOf(html, id, attribute) {
  const tag = html.match(new RegExp(`<[^>]*id=["']${id}["'][^>]*>`, "i"))?.[0];
  return tag?.match(new RegExp(`${attribute}=["']([^"']*)["']`, "i"))?.[1];
}

export const checks = [
  {
    name: "the home page renders for each request",
    async run({ get, assert }) {
      const first = await get("/");
      assert(first.status === 200, `status ${first.status}`);

      const a = textOf(first.body, "rendered-at");
      assert(a, "no rendered-at on the page");

      await new Promise((resolve) => setTimeout(resolve, 20));
      const b = textOf((await get("/")).body, "rendered-at");
      assert(a !== b, `the timestamp did not change: ${a}`);
    },
  },

  {
    name: "middleware puts the country on Astro.locals",
    async run({ get, assert, mode }) {
      // The edge writes this header itself, so a live run cannot choose it.
      const page = await get("/", { headers: { "cdn-requestcountrycode": "SI" } });
      const country = textOf(page.body, "country");
      if (mode === "live") {
        assert(/^[A-Z]{2}$/.test(country ?? ""), `got ${country}`);
      } else {
        assert(country === "SI", `got ${country}`);
      }
    },
  },

  {
    name: "Astro.clientAddress reads the visitor IP",
    async run({ get, assert, mode }) {
      // Live, the edge overwrites x-forwarded-for, so only check it is filled.
      const forwarded = "203.0.113.7";
      const page = await get("/edge", { headers: { "x-forwarded-for": forwarded } });
      const value = textOf(page.body, "astro-clientaddress");
      if (mode === "live") {
        assert(value && value !== "unknown", "clientAddress is empty");
      } else {
        assert(value === forwarded, `got ${value}`);
      }
    },
  },

  {
    name: "the edge request id reaches Astro.locals.runtime",
    async run({ get, assert, mode }) {
      const page = await get("/edge", { headers: { "cdn-requestid": "abc123" } });
      const id = textOf(page.body, "runtime-requestid");
      if (mode === "live") {
        // The edge overwrites the header with its own id.
        assert(/^[0-9a-f]{16,}$/.test(id ?? ""), `got ${id}`);
      } else {
        assert(id === "abc123", `got ${id}`);
      }
    },
  },

  {
    name: "a server endpoint answers with JSON",
    async run({ get, assert }) {
      const response = await get("/api/hello");
      assert(response.status === 200, `status ${response.status}`);
      assert(
        response.headers.get("content-type")?.includes("application/json"),
        `content-type ${response.headers.get("content-type")}`,
      );
      const body = JSON.parse(response.body);
      assert(body.ok === true, "ok is not true");
      assert(typeof body.at === "string", "at is missing");
    },
  },

  {
    name: "an endpoint accepts a POST from the site itself",
    async run({ get, assert, baseUrl }) {
      const response = await get("/api/hello", {
        method: "POST",
        headers: { origin: baseUrl, "content-type": "text/plain" },
        body: "twelve bytes",
      });
      assert(response.status === 200, `status ${response.status}`);
      assert(JSON.parse(response.body).received === 12, "the body did not arrive");
    },
  },

  {
    name: "node:fs survives the bundle and works at runtime",
    async run({ get, assert }) {
      // Edge Scripting gives the script a virtual file system, so a dependency
      // that reaches for node:fs is not automatically a problem.
      const response = await get("/api/scratch");
      assert(response.status === 200, `status ${response.status}`);
      assert(JSON.parse(response.body).ok === true, "the file did not read back");
    },
  },

  {
    name: "a dynamic route renders",
    async run({ get, assert }) {
      const response = await get("/blog/hello-edge");
      assert(response.status === 200, `status ${response.status}`);
      assert(textOf(response.body, "post-body"), "the post body is missing");
    },
  },

  {
    name: "Astro.cookies round-trips",
    async run({ get, assert }) {
      const first = await get("/counter");
      const setCookie = first.headers.get("set-cookie") ?? "";
      assert(/visits=1\b/.test(setCookie), `Set-Cookie was ${setCookie || "absent"}`);
      assert(textOf(first.body, "count") === "1", "the first visit did not count");

      const second = await get("/counter", { headers: { cookie: "visits=41" } });
      assert(textOf(second.body, "count") === "42", "the cookie was not read back");
    },
  },

  {
    name: "a prerendered page comes from storage",
    async run({ get, assert }) {
      const first = await get("/about");
      assert(first.status === 200, `status ${first.status}`);
      assert(
        first.headers.get("content-type")?.startsWith("text/html"),
        `content-type ${first.headers.get("content-type")}`,
      );
      assert(textOf(first.body, "prerendered"), "the page is not the prerendered one");

      const second = await get("/about");
      assert(
        textOf(first.body, "built-at") === textOf(second.body, "built-at"),
        "the build timestamp changed, so the page was rendered again",
      );
    },
  },

  {
    name: "an unknown path gets the prerendered 404",
    async run({ get, assert }) {
      const response = await get("/nothing-is-here");
      assert(response.status === 404, `status ${response.status}`);
      assert(textOf(response.body, "not-found"), "the 404 page did not come back");
    },
  },

  {
    name: "a hashed asset is served with the right type",
    async run({ get, assert }) {
      const page = await get("/");
      const href = page.body.match(/href="(\/_astro\/[^"]+\.css)"/)?.[1];
      assert(href, "the page links no stylesheet");

      const asset = await get(href);
      assert(asset.status === 200, `status ${asset.status}`);
      assert(
        asset.headers.get("content-type")?.startsWith("text/css"),
        `content-type ${asset.headers.get("content-type")}`,
      );
      assert(
        asset.headers.get("cache-control")?.includes("immutable"),
        `cache-control ${asset.headers.get("cache-control")}`,
      );
    },
  },

  {
    name: "a file from public/ is served",
    async run({ get, assert }) {
      const response = await get("/square.png");
      assert(response.status === 200, `status ${response.status}`);
      assert(
        response.headers.get("content-type") === "image/png",
        `content-type ${response.headers.get("content-type")}`,
      );
    },
  },

  {
    name: "the image service writes Optimizer parameters",
    async run({ get, assert }) {
      const page = await get("/gallery");
      assert(page.status === 200, `status ${page.status}`);

      const src = attrOf(page.body, "hero", "src");
      assert(src?.includes("width="), `src was ${src}`);

      const srcset = attrOf(page.body, "hero", "srcset");
      assert(srcset?.includes("360w"), `srcset was ${srcset}`);
      assert(srcset?.includes("width=360"), "the srcset entry has no width parameter");
    },
  },

  {
    name: "routeRules produce cache headers and a purge tag",
    async run({ get, assert }) {
      const response = await get("/cached");
      assert(response.status === 200, `status ${response.status}`);

      const cacheControl = response.headers.get("cache-control") ?? "";
      assert(cacheControl.includes("s-maxage=60"), `cache-control ${cacheControl}`);
      assert(cacheControl.includes("stale-while-revalidate=600"), `cache-control ${cacheControl}`);

      const tag = response.headers.get("cdn-tag") ?? "";
      assert(tag.includes("demo"), `cdn-tag ${tag}`);
      assert(tag.includes("astro-path:/cached"), `cdn-tag ${tag}`);
    },
  },

  {
    name: "a rendered page is never left cacheable by accident",
    async run({ get, assert }) {
      // A pull zone applies its own expiration to a response with no
      // directive, which would hand one visitor's page to the next.
      for (const path of ["/", "/session", "/edge"]) {
        const value = (await get(path)).headers.get("cache-control") ?? "";
        assert(/no-store/.test(value), `${path} answered with "${value}"`);
      }
    },
  },

  {
    name: "a session survives the next request",
    async run({ get, assert, baseUrl }) {
      const start = await get("/session");
      assert(start.status === 200, `status ${start.status}`);
      assert(!textOf(start.body, "session-error"), "the session store is unreachable");

      // Astro rejects a cross-origin form POST, so send the site's own origin.
      const saved = await get("/session", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: baseUrl,
        },
        body: "name=Bunny",
        redirect: "manual",
      });
      assert(saved.status === 303, `status ${saved.status}`);

      const cookie = (saved.headers.get("set-cookie") ?? "").split(";")[0];
      assert(cookie.startsWith("showcase-session="), `Set-Cookie was ${cookie || "absent"}`);

      const back = await get("/session", { headers: { cookie } });
      assert(textOf(back.body, "session-name") === "Bunny", "the session did not come back");
    },
  },

  {
    name: "no page has lost the space before a tag",
    async run({ get, assert }) {
      // Astro compresses HTML, so a newline between a word and the tag after
      // it disappears and the two words run together on the page. Writing
      // "so a plain\n<code>" is enough to cause it, and it is easy to miss.
      const pages = [
        "/",
        "/edge",
        "/counter",
        "/session",
        "/gallery",
        "/cached",
        "/about",
        "/blog/hello-edge",
        "/nothing-is-here",
      ];
      for (const path of pages) {
        const body = (await get(path)).body;
        const glued = body.match(/[A-Za-z,.)]<(?:a|code|strong|em)\b[^>]*>/g);
        assert(!glued, `${path} runs words together: ${glued?.slice(0, 3).join(", ")}`);
      }
    },
  },

  {
    name: "every link on the home page resolves",
    async run({ get, assert }) {
      // A formatter once turned href={page.href} into a literal string, and
      // every tile pointed at /%7Bpage.href%7D.
      const body = (await get("/")).body;
      const links = [...body.matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1]);
      assert(links.length > 8, `found only ${links.length} links`);

      for (const href of new Set(links)) {
        assert(!/[{}]|%7[bd]/i.test(href), `${href} is not a real path`);
        const status = (await get(href, { method: "HEAD" })).status;
        assert(status === 200, `${href} answered ${status}`);
      }
    },
  },

  {
    name: "a HEAD request answers without a body",
    async run({ get, assert }) {
      const response = await get("/about", { method: "HEAD" });
      assert(response.status === 200, `status ${response.status}`);
      assert(response.body === "", "a HEAD request returned a body");
    },
  },

  {
    name: "a path that climbs out of the zone is refused",
    async run({ get, assert }) {
      const response = await get("/_astro/../../../../etc/passwd");
      assert(response.status === 404, `status ${response.status}`);
      assert(!response.body.includes("root:"), "the script read a file outside the zone");
    },
  },
];
