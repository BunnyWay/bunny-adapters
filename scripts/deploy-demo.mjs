#!/usr/bin/env node
/**
 * Deploy the showcase to a real Edge Script, and optionally prove it works
 * there.
 *
 * This is the manual tier of the test suite. Continuous integration never runs
 * it, and this repository holds no credential.
 *
 *   node scripts/deploy-demo.mjs            build, upload, deploy
 *   node scripts/deploy-demo.mjs --verify   then run the checks against the URL
 *   node scripts/deploy-demo.mjs --verify-only   only run the checks
 *
 * `tests/live.mjs` runs the same checks on their own, and it can also turn
 * Bunny Optimizer on and off around them.
 *
 * It needs the bunny CLI, an authenticated profile, and:
 *
 *   BUNNY_SCRIPT          the Edge Script name or id
 *   BUNNY_STORAGE_ZONE    the zone that holds dist/client
 *   BUNNY_STORAGE_KEY     that zone's write password
 *   BUNNY_SITE_URL        the site's URL, for --verify
 *
 * Put them in a `.env` beside this repository's root; it is ignored by git.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checks } from "../examples/astro-showcase/e2e/checks.mjs";
import { runChecks } from "../tests/runner.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));
const showcase = path.join(repo, "examples/astro-showcase");

/** Read a `.env` at the repository root, without adding a dependency. */
function loadEnv() {
  const file = path.join(repo, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw new Error(`Cannot run "${command}": ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

function fromEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See the top of this file.`);
  return value;
}

loadEnv();
const verify = process.argv.includes("--verify") || process.argv.includes("--verify-only");
const deploy = !process.argv.includes("--verify-only");

if (deploy) {
  const script = fromEnv("BUNNY_SCRIPT");
  fromEnv("BUNNY_STORAGE_ZONE");
  fromEnv("BUNNY_STORAGE_KEY");

  console.log("building the showcase\n");
  run("npm", ["run", "build"], { cwd: showcase });

  console.log("\nuploading the client build and deploying the script\n");
  run("npx", ["bunny-astro", "deploy", "--delete-stale", "--script", script], { cwd: showcase });
}

if (verify) {
  const baseUrl = fromEnv("BUNNY_SITE_URL").replace(/\/+$/, "");
  console.log(`\nchecking ${baseUrl}`);

  // The edge needs a moment to pick up a new release.
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const failures = await runChecks(checks, { baseUrl, mode: "live" });
  console.log(
    failures === 0
      ? "\n\u001b[32mall checks passed against the live site\u001b[0m"
      : `\n\u001b[31m${failures} check(s) failed\u001b[0m`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
