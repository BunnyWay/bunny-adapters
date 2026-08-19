#!/usr/bin/env node
/**
 * bunny-astro — put an Astro build on Edge Scripting.
 *
 * `deploy` is the command to use. It uploads the client build and then deploys
 * the script, in that order. Doing only the second one is the classic mistake:
 * Astro renames its CSS and JS bundles whenever they change, so the new names
 * are missing from storage and the site loses its styles.
 */
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { encodeObjectPath } from "../runtime/paths.js";

const USAGE = `bunny-astro <command> [options]

Commands:
  deploy    Upload the client build, then deploy the script
  upload    Upload the client build only

Options:
  --dir <path>       Folder to upload            (default: dist/client)
  --zone <name>      Storage zone name           (env: BUNNY_STORAGE_ZONE)
  --host <hostname>  Storage endpoint            (env: BUNNY_STORAGE_HOST,
                                                  default storage.bunnycdn.com)
  --key <password>   Storage write password      (env: BUNNY_STORAGE_KEY)
  --script <id>      Edge Script to deploy to    (default: the linked one)
  --outfile <path>   Bundle to deploy            (default: from the build)
  --concurrency <n>  Parallel uploads            (default: 8)
  --delete-stale     Remove objects the build no longer produces
  --dry-run          List what would happen, and change nothing
  -h, --help         Show this message

The password is read from the environment when --key is omitted, so it stays
out of your shell history and your CI logs.

Examples:
  BUNNY_STORAGE_ZONE=my-site BUNNY_STORAGE_KEY=... npx bunny-astro deploy
  npx bunny-astro upload --delete-stale --dry-run
`;

interface Args {
  dir: string;
  zone: string;
  host: string;
  key: string;
  script: string;
  outfile: string;
  concurrency: number;
  deleteStale: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  // A value that is not a whole number of 1 or more would leave `pool()` with
  // no workers. That uploads nothing and still reports success, which is worse
  // than stopping here: `deploy` would then ship a script against the previous
  // build's assets.
  const rawConcurrency = get("--concurrency");
  const concurrency = rawConcurrency === undefined ? 8 : Number(rawConcurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    fail(`--concurrency must be a whole number of 1 or more, not "${rawConcurrency}".`);
  }

  return {
    dir: get("--dir") ?? "dist/client",
    zone: get("--zone") ?? process.env.BUNNY_STORAGE_ZONE ?? "",
    host: get("--host") ?? process.env.BUNNY_STORAGE_HOST ?? "storage.bunnycdn.com",
    key: get("--key") ?? process.env.BUNNY_STORAGE_KEY ?? "",
    script: get("--script") ?? process.env.BUNNY_SCRIPT_ID ?? "",
    outfile: get("--outfile") ?? "",
    concurrency,
    deleteStale: argv.includes("--delete-stale"),
    dryRun: argv.includes("--dry-run"),
  };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function baseUrl(args: Args): string {
  const host = args.host.replace(/\/+$/, "");
  const scheme = /^https?:\/\//i.test(host) ? "" : "https://";
  return `${scheme}${host}/${args.zone}`;
}

/**
 * The URL for one object in the zone.
 *
 * The path comes from the local file system, so it can hold a character that
 * means something else in a URL. A `#` would truncate it, and a `?` would turn
 * the rest into a query string, so the upload would land under the wrong name.
 */
function objectUrl(args: Args, object: string): string {
  return `${baseUrl(args)}/${encodeObjectPath(object)}`;
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFiles(full, base);
      return [path.relative(base, full).split(path.sep).join("/")];
    }),
  );
  return files.flat();
}

/** Every object already in the zone, under `prefix`. */
async function listZone(args: Args, prefix = ""): Promise<string[]> {
  const response = await fetch(objectUrl(args, prefix), {
    headers: { AccessKey: args.key, Accept: "application/json" },
  });
  if (!response.ok) return [];

  const entries = (await response.json()) as { ObjectName: string; IsDirectory: boolean }[];
  const found: string[] = [];
  for (const entry of entries) {
    const objectPath = prefix ? `${prefix}${entry.ObjectName}` : entry.ObjectName;
    if (entry.IsDirectory) {
      found.push(...(await listZone(args, `${objectPath}/`)));
    } else {
      found.push(objectPath);
    }
  }
  return found;
}

async function upload(args: Args, relative: string): Promise<void> {
  const body = await readFile(path.join(args.dir, relative));
  const url = objectUrl(args, relative);

  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url, {
      method: "PUT",
      headers: { AccessKey: args.key, "Content-Type": "application/octet-stream" },
      body,
    });
    if (response.status === 201) return;
    if (attempt === 3) {
      throw new Error(`${response.status} ${response.statusText} for ${relative}`);
    }
    // A zone created moments ago can answer 401 until it propagates.
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
}

/** Run `worker` over `items`, at most `limit` at a time. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++]!);
    }
  });
  await Promise.all(runners);
}

async function runUpload(args: Args): Promise<void> {
  if (!args.zone) fail("No storage zone. Pass --zone or set BUNNY_STORAGE_ZONE.");
  if (!args.key && !args.dryRun) {
    fail("No storage password. Pass --key or set BUNNY_STORAGE_KEY.");
  }

  const files = await listFiles(args.dir).catch(() =>
    fail(`Cannot read ${args.dir}. Run the Astro build first.`),
  );
  if (files.length === 0) fail(`${args.dir} is empty. Nothing to upload.`);

  if (args.dryRun) {
    console.log(`Would upload ${files.length} file(s) to ${args.zone}:`);
    for (const file of files.sort()) console.log(`  ${file}`);
  } else {
    console.log(`Uploading ${files.length} file(s) from ${args.dir} to ${args.zone}`);
    const width = String(files.length).length;
    let done = 0;
    await pool(files, args.concurrency, async (file) => {
      await upload(args, file);
      done++;
      console.log(`  ${String(done).padStart(width)}/${files.length}  ${file}`);
    });
  }

  if (args.deleteStale) await removeStale(args, new Set(files));
  if (!args.dryRun) console.log("Upload complete.");
}

/**
 * Remove objects the build no longer produces.
 *
 * Astro hashes its asset names, so every build leaves the previous ones behind.
 * They cost storage and they never expire on their own.
 */
async function removeStale(args: Args, keep: Set<string>): Promise<void> {
  const existing = await listZone(args);
  const stale = existing.filter((object) => !keep.has(object));
  if (stale.length === 0) {
    console.log("No stale objects.");
    return;
  }

  if (args.dryRun) {
    console.log(`Would delete ${stale.length} stale object(s):`);
    for (const object of stale.sort()) console.log(`  ${object}`);
    return;
  }

  console.log(`Deleting ${stale.length} stale object(s)`);
  await pool(stale, args.concurrency, async (object) => {
    const response = await fetch(objectUrl(args, object), {
      method: "DELETE",
      headers: { AccessKey: args.key },
    });
    console.log(`  ${response.ok ? "gone" : "kept"}  ${object}`);
  });
}

/** Where the adapter put the bundle. */
async function findBundle(args: Args): Promise<string> {
  if (args.outfile) return args.outfile;
  const outDir = path.dirname(path.resolve(args.dir));
  try {
    const info = JSON.parse(await readFile(path.join(outDir, ".bunny-adapter.json"), "utf8"));
    return info.outfile as string;
  } catch {
    return "dist/index.js";
  }
}

function run(command: string, commandArgs: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.once("error", () =>
      reject(new Error(`Cannot run "${command}". Install the bunny CLI: https://bunny.net/cli`)),
    );
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

async function runDeploy(args: Args): Promise<void> {
  await runUpload(args);

  const bundle = await findBundle(args);
  const commandArgs = ["scripts", "deploy", bundle];
  if (args.script) commandArgs.push(args.script);

  if (args.dryRun) {
    console.log(`Would run: bunny ${commandArgs.join(" ")}`);
    return;
  }
  console.log(`\nDeploying ${bundle}`);
  await run("bunny", commandArgs);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === "-h" || command === "--help" || command === "help") {
    console.log(USAGE);
    process.exit(command ? 0 : 1);
  }

  const args = parseArgs(argv);
  if (command === "upload") return runUpload(args);
  if (command === "deploy") return runDeploy(args);

  fail(`Unknown command: ${command}\n\n${USAGE}`);
}

main().catch((error: unknown) => {
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
