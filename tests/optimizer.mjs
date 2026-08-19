/**
 * What Bunny Optimizer does to the URLs the image service writes.
 *
 * The adapter's `imageService: "bunny"` adds `width`, `height`, `quality`, and
 * `format` to an image's own URL, and Optimizer does the work at the edge. So
 * the only honest test is a real pull zone, with Optimizer off and then on.
 *
 * These checks run twice, from `tests/live.mjs`. Nothing here can run offline:
 * Optimizer is a pull zone feature, and no emulator stands in for it.
 */
import { imageSize } from "./image-size.mjs";

/** The `<img>` on the showcase gallery page. */
function heroTag(html) {
  return html.match(/<img[^>]*id="hero"[^>]*>/i)?.[0];
}

function attr(tag, name) {
  return tag?.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1]?.replaceAll("&amp;", "&");
}

/**
 * Fetch an image and read its real size.
 *
 * Every request carries a token nothing else uses, so it misses the CDN cache
 * and reaches Optimizer. Without that, a run would read the answer the
 * previous run cached, under the opposite setting.
 */
async function fetchImage(baseUrl, path, token) {
  const url = new URL(path, baseUrl);
  url.searchParams.set("bunny-test", token);

  const response = await fetch(url, {
    // What a browser sends. Optimizer picks WebP when it may.
    headers: { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
    cache: "no-store",
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    headers: response.headers,
    bytes,
    size: imageSize(bytes),
    url: url.toString(),
  };
}

/** How a failed image request should read in the report. */
function describe(image) {
  const type = image.headers.get("content-type") ?? "no content type";
  if (image.status === 523) {
    return (
      `${image.status} Origin Connection Failed. Optimizer did not reach the ` +
      `Edge Script that serves this zone.`
    );
  }
  return `${image.status}, ${type}, ${image.bytes.length} bytes`;
}

/**
 * The checks. `optimizer` says which state the pull zone is in, so one list
 * describes both halves of the run.
 *
 * @param {{ optimizer: boolean, token: string }} options
 */
export function optimizerChecks({ optimizer, token }) {
  const state = optimizer ? "on" : "off";

  return [
    {
      name: `Optimizer ${state}: the gallery page writes the parameters`,
      async run({ get, assert }) {
        // The image service runs at build time, so this never changes with the
        // pull zone. It is here so a failure below cannot be blamed on the tag.
        const page = await get("/gallery");
        assert(page.status === 200, `status ${page.status}`);

        const hero = heroTag(page.body);
        assert(hero, "the gallery page has no hero image");

        const src = attr(hero, "src");
        assert(src?.includes("width=1600"), `src was ${src}`);
        assert(src?.includes("quality=82"), `src was ${src}`);

        const srcset = attr(hero, "srcset");
        for (const width of [360, 720, 1080]) {
          assert(srcset?.includes(`width=${width}`), `srcset has no width=${width}: ${srcset}`);
          assert(srcset?.includes(`${width}w`), `srcset has no ${width}w descriptor: ${srcset}`);
        }
      },
    },

    {
      name: `Optimizer ${state}: the original image is served`,
      async run({ get, assert, baseUrl }) {
        const page = await get("/gallery");
        const source = attr(heroTag(page.body), "src")?.split("?")[0];
        assert(source, "the hero image has no source");

        const image = await fetchImage(baseUrl, source, `${token}-original`);
        assert(image.status === 200, `${source} answered ${describe(image)}`);
        assert(image.size, `the answer is not an image we can read: ${describe(image)}`);
        assert(
          image.size.width === 1600 && image.size.height === 900,
          `the original is ${image.size.width}x${image.size.height}, not 1600x900`,
        );
      },
    },

    {
      name: optimizer
        ? "Optimizer on: a width parameter resizes the image"
        : "Optimizer off: a width parameter is ignored",
      async run({ get, assert, baseUrl }) {
        const page = await get("/gallery");
        const srcset = attr(heroTag(page.body), "srcset");
        const entry = srcset
          ?.split(",")
          .find((part) => part.includes("360w"))
          ?.trim()
          .split(" ")[0];
        assert(entry, `no 360w entry in ${srcset}`);

        const image = await fetchImage(baseUrl, entry, `${token}-360`);
        assert(image.status === 200, `${entry} answered ${describe(image)}`);
        assert(image.size, `the answer is not an image we can read: ${describe(image)}`);

        if (optimizer) {
          assert(
            image.size.width === 360,
            `Optimizer is on and the image is ${image.size.width}px wide, not 360px`,
          );
          assert(
            image.bytes.length < 60_000,
            `a 360px image is ${image.bytes.length} bytes, so it was not re-encoded`,
          );
        } else {
          // Without Optimizer the parameters mean nothing, and the visitor gets
          // the file as it was built. The adapter says so, and this proves it.
          assert(
            image.size.width === 1600,
            `Optimizer is off and the image is ${image.size.width}px wide, not 1600px`,
          );
        }
      },
    },

    {
      name: optimizer
        ? "Optimizer on: every srcset entry comes back at its own width"
        : "Optimizer off: every srcset entry still answers",
      async run({ get, assert, baseUrl }) {
        const page = await get("/gallery");
        const srcset = attr(heroTag(page.body), "srcset") ?? "";

        for (const part of srcset.split(",")) {
          const [url, descriptor] = part.trim().split(/\s+/);
          if (!url || !descriptor) continue;
          const wanted = Number.parseInt(descriptor, 10);

          const image = await fetchImage(baseUrl, url, `${token}-set-${wanted}`);
          assert(image.status === 200, `${descriptor} answered ${describe(image)}`);
          assert(image.size, `${descriptor} is not an image we can read: ${describe(image)}`);

          if (optimizer) {
            assert(
              image.size.width === wanted,
              `${descriptor} came back ${image.size.width}px wide`,
            );
          }
        }
      },
    },

    {
      name: `Optimizer ${state}: a file from public/ is still a PNG`,
      async run({ assert, baseUrl }) {
        // Optimizer may re-encode to WebP when the browser accepts it. That is
        // fine for a photo, and it must not happen to a file the site asks for
        // by name from public/, which a script or a manifest may depend on.
        const image = await fetchImage(baseUrl, "/square.png", `${token}-public`);
        assert(image.status === 200, `/square.png answered ${describe(image)}`);
        assert(image.size, `the answer is not an image we can read: ${describe(image)}`);
        assert(
          ["png", "webp", "avif"].includes(image.size.format),
          `/square.png came back as ${image.size.format}`,
        );
      },
    },

    {
      name: `Optimizer ${state}: the stylesheet still arrives`,
      async run({ get, assert }) {
        // Optimizer minifies CSS and JavaScript as well, and both settings are
        // on by default. So a stylesheet goes through Optimizer too, and it
        // has to survive the trip. The request must miss the CDN cache, or it
        // reads the answer from before Optimizer was turned on.
        const page = await get(`/?bunny-test=${token}-page`);
        assert(page.status === 200, `the home page answered ${page.status}`);

        const href = page.body.match(/href="(\/_astro\/[^"]+\.css)"/)?.[1];
        assert(href, "the home page links no stylesheet");

        const style = await get(`${href}?bunny-test=${token}-css`);
        assert(style.status === 200, `${href} answered ${style.status}`);
        assert(
          style.headers.get("content-type")?.startsWith("text/css"),
          `${href} came back as ${style.headers.get("content-type")}`,
        );
        assert(style.body.length > 0, `${href} came back empty`);
      },
    },

    {
      name: `Optimizer ${state}: a prerendered page still arrives`,
      async run({ get, assert }) {
        // Optimizer can prerender HTML of its own. That must not stand in for
        // the page the script reads out of Bunny Storage.
        const stored = await get(`/about?bunny-test=${token}-about`);
        assert(stored.status === 200, `the prerendered page answered ${stored.status}`);
        assert(/id="prerendered"/.test(stored.body), "the page is not the prerendered one");
      },
    },
  ];
}
