import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { largestContributors } from "../dist/build/bundle.js";

/**
 * A script above 10 MB is a wall a real project hits, and "10 MB" alone tells
 * nobody what to do about it. This is how the message names the packages that
 * filled the file.
 */
describe("largestContributors", () => {
  it("adds up every file of a package, and sorts by size", () => {
    const result = largestContributors(
      {
        "node_modules/shiki/dist/a.js": { bytesInOutput: 300 },
        "node_modules/shiki/dist/b.js": { bytesInOutput: 500 },
        "node_modules/tiny/index.js": { bytesInOutput: 10 },
      },
      5,
    );
    assert.deepEqual(result, [
      { name: "shiki", bytes: 800 },
      { name: "tiny", bytes: 10 },
    ]);
  });

  it("keeps a scope with its package name", () => {
    const result = largestContributors(
      { "node_modules/@astrojs/mdx/dist/index.js": { bytesInOutput: 42 } },
      5,
    );
    assert.deepEqual(result, [{ name: "@astrojs/mdx", bytes: 42 }]);
  });

  it("reads through a nested node_modules to the package that is really there", () => {
    const result = largestContributors(
      { "node_modules/a/node_modules/b/index.js": { bytesInOutput: 7 } },
      5,
    );
    assert.deepEqual(result, [{ name: "b", bytes: 7 }]);
  });

  it("names the project's own folder rather than a package", () => {
    const result = largestContributors({ "src/pages/index.astro": { bytesInOutput: 9 } }, 5);
    assert.deepEqual(result, [{ name: "this project (src)", bytes: 9 }]);
  });

  it("returns only as many as it was asked for", () => {
    const inputs = {};
    for (let i = 0; i < 10; i++) inputs[`node_modules/p${i}/index.js`] = { bytesInOutput: i };
    assert.equal(largestContributors(inputs, 3).length, 3);
    assert.equal(largestContributors(inputs, 3)[0].name, "p9");
  });
});
