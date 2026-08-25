/**
 * Runs a list of checks against a running site, and reports.
 *
 * Shared by the offline end-to-end run and the live deployment run, so a check
 * is written once and proves the same thing in both places.
 */
import { createServer } from "node:net";

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

class CheckFailed extends Error {}

/**
 * @param {Array<{name: string, run: (ctx: any) => Promise<void>}>} checks
 * @param {{baseUrl: string, mode: "local" | "live"}} options
 * @returns {Promise<number>} the number of failures
 */
export async function runChecks(checks, { baseUrl, mode }) {
  const get = async (path, init = {}) => {
    const response = await fetch(new URL(path, baseUrl), {
      redirect: init.redirect ?? "follow",
      ...init,
    });
    const body = init.method === "HEAD" ? "" : await response.text();
    return { status: response.status, headers: response.headers, body, response };
  };

  const assert = (ok, why) => {
    if (!ok) throw new CheckFailed(why);
  };

  let failures = 0;
  for (const check of checks) {
    const started = Date.now();
    try {
      await check.run({ get, assert, baseUrl, mode });
      console.log(
        `  ${GREEN}pass${RESET}  ${check.name} ${DIM}(${Date.now() - started}ms)${RESET}`,
      );
    } catch (error) {
      failures++;
      const detail = error instanceof CheckFailed ? error.message : `${error}`;
      console.log(`  ${RED}FAIL${RESET}  ${check.name}`);
      console.log(`        ${RED}${detail}${RESET}`);
      if (!(error instanceof CheckFailed) && error?.stack) {
        console.log(`${DIM}${error.stack.split("\n").slice(1, 4).join("\n")}${RESET}`);
      }
    }
  }
  return failures;
}

/** Wait until the site answers, so a slow start is not a failed run. */
export async function waitForSite(baseUrl, { timeoutMs = 30_000, isAlive = () => true } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error("The server stopped before it answered.");
    try {
      await fetch(baseUrl, { method: "HEAD" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`No answer from ${baseUrl} within ${timeoutMs / 1000}s.`);
}

/** A port nothing is listening on. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
