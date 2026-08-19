#!/usr/bin/env node
/**
 * The live tier. It runs the checks against a real deployment, and it turns
 * Bunny Optimizer on and off around them.
 *
 * Continuous integration never runs this, because the repository holds no
 * credential. Run it by hand after a deploy:
 *
 *   node tests/live.mjs                  the showcase checks
 *   node tests/live.mjs --optimizer      those, then Optimizer off and on
 *   node tests/live.mjs --optimizer-only just the Optimizer half
 *
 * It needs `BUNNY_SITE_URL` in a `.env` at the repository root. The Optimizer
 * half also needs the bunny CLI with an authenticated profile, or a
 * `BUNNY_API_KEY`. The pull zone is found from the site's own response header,
 * so nothing has to name it.
 *
 * Optimizer is a paid feature. So this reads the pull zone's setting first, and
 * it puts the setting back at the end, even when a check fails or you stop it
 * with Ctrl-C.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checks } from "../examples/astro-showcase/e2e/checks.mjs";
import { optimizerChecks } from "./optimizer.mjs";
import { runChecks } from "./runner.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));

const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";
const RESET = "[0m";

/** How long the network takes to pick up a pull zone change. */
const SETTLE_MS = Number(process.env.OPTIMIZER_SETTLE_MS ?? 45_000);

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

function fromEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See the top of this file.`);
  return value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The pull zone that serves this site.
 *
 * bunny.net names it in a response header, so the test does not need a second
 * setting that can go stale.
 */
async function findPullZone(baseUrl) {
  const response = await fetch(baseUrl, { method: "HEAD", cache: "no-store" });
  const id = response.headers.get("cdn-pullzone");
  if (!id) {
    throw new Error(
      `${baseUrl} sent no cdn-pullzone header, so it is not behind a bunny.net pull zone.`,
    );
  }
  return id;
}

/**
 * One pull zone API call.
 *
 * `BUNNY_API_KEY` is used when it is there. Otherwise the bunny CLI is, which
 * keeps the key in the CLI's own profile and out of this repository.
 */
async function api(method, endpoint, body) {
  const key = process.env.BUNNY_API_KEY;
  if (key) {
    const response = await fetch(`https://api.bunny.net${endpoint}`, {
      method,
      headers: { AccessKey: key, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${endpoint} answered ${response.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  }

  const args = ["api", method, endpoint, "-o", "json"];
  if (body) args.push("--body", JSON.stringify(body));
  const result = spawnSync("bunny", args, { encoding: "utf8" });
  if (result.error) {
    throw new Error(
      "Cannot run the bunny CLI, and BUNNY_API_KEY is not set. " +
        "Install the CLI: https://bunny.net/cli",
    );
  }
  if (result.status !== 0) {
    throw new Error(`bunny ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  // The CLI prints the object on its own, so the first `{` starts the answer.
  const start = result.stdout.indexOf("{");
  return start === -1 ? {} : JSON.parse(result.stdout.slice(start));
}

/** Whether Optimizer is on for this zone. */
async function readOptimizer(zone) {
  const settings = await api("GET", `/pullzone/${zone}`);
  return Boolean(settings.OptimizerEnabled);
}

/** Turn Optimizer on or off, and wait for the network to notice. */
async function setOptimizer(zone, enabled) {
  await api("POST", `/pullzone/${zone}`, { OptimizerEnabled: enabled });

  // The API answers before every edge has the new setting.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if ((await readOptimizer(zone)) === enabled) break;
    await sleep(2000);
  }
  console.log(
    `${DIM}  Optimizer is ${enabled ? "on" : "off"}. ` +
      `Waiting ${SETTLE_MS / 1000}s for the network.${RESET}`,
  );
  await sleep(SETTLE_MS);
}

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  const optimizerOnly = argv.includes("--optimizer-only");
  const withOptimizer = optimizerOnly || argv.includes("--optimizer");

  const baseUrl = fromEnv("BUNNY_SITE_URL").replace(/\/+$/, "");
  // One token per run, so no check reads what the last run cached.
  const token = `${Date.now().toString(36)}`;

  let failures = 0;

  if (!optimizerOnly) {
    console.log(`checking ${baseUrl}\n`);
    failures += await runChecks(checks, { baseUrl, mode: "live" });
  }

  if (withOptimizer) {
    const zone = await findPullZone(baseUrl);
    const wasEnabled = await readOptimizer(zone);
    console.log(
      `\nOptimizer on pull zone ${zone} is ${wasEnabled ? "on" : "off"}. ` +
        `It will be ${wasEnabled ? "on" : "off"} again at the end.`,
    );

    // Optimizer is a paid feature, so the setting goes back whatever happens,
    // including on Ctrl-C.
    let restored = false;
    const restore = async () => {
      if (restored) return;
      restored = true;
      if ((await readOptimizer(zone)) !== wasEnabled) {
        console.log(`\n${DIM}putting Optimizer back to ${wasEnabled ? "on" : "off"}${RESET}`);
        await api("POST", `/pullzone/${zone}`, { OptimizerEnabled: wasEnabled });
      }
    };
    const onSignal = () => {
      void restore().finally(() => process.exit(130));
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);

    try {
      for (const enabled of [false, true]) {
        console.log(`\nOptimizer ${enabled ? "on" : "off"}`);
        await setOptimizer(zone, enabled);
        failures += await runChecks(optimizerChecks({ optimizer: enabled, token }), {
          baseUrl,
          mode: "live",
        });
      }
    } finally {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      await restore();
    }
  }

  console.log(
    failures === 0
      ? `\n${GREEN}all checks passed against the live site${RESET}`
      : `\n${RED}${failures} check(s) failed${RESET}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${RED}${error instanceof Error ? error.message : String(error)}${RESET}`);
  process.exit(1);
});
