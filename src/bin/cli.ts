#!/usr/bin/env node
/**
 * bunny-astro upload — send `dist/client` to a Bunny Storage zone.
 *
 * The client folder must be uploaded on every deploy. Astro renames its CSS
 * and JS bundles whenever they change, so a script-only deploy leaves the new
 * names missing and the site loses its styles.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const USAGE = `bunny-astro upload [options]

Upload the Astro client build to a Bunny Storage zone.

Options:
  --dir <path>       Folder to upload           (default: dist/client)
  --zone <name>      Storage zone name          (env: BUNNY_STORAGE_ZONE)
  --host <hostname>  Storage endpoint           (env: BUNNY_STORAGE_HOST,
                                                 default storage.bunnycdn.com)
  --key <password>   Storage write password     (env: BUNNY_STORAGE_KEY)
  --concurrency <n>  Parallel uploads           (default: 8)
  --dry-run          List what would be sent, and send nothing
  -h, --help         Show this message

The password is read from the environment when --key is omitted, so it stays
out of your shell history and your CI logs.
`;

interface Args {
  dir: string;
  zone: string;
  host: string;
  key: string;
  concurrency: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    dir: get("--dir") ?? "dist/client",
    zone: get("--zone") ?? process.env.BUNNY_STORAGE_ZONE ?? "",
    host: get("--host") ?? process.env.BUNNY_STORAGE_HOST ?? "storage.bunnycdn.com",
    key: get("--key") ?? process.env.BUNNY_STORAGE_KEY ?? "",
    concurrency: Number(get("--concurrency") ?? 8),
    dryRun: argv.includes("--dry-run"),
  };
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

async function upload(args: Args, relative: string): Promise<void> {
  const body = await readFile(path.join(args.dir, relative));
  const url = `https://${args.host}/${args.zone}/${relative}`;

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
      const item = items[next++]!;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === "-h" || command === "--help" || command === "help") {
    console.log(USAGE);
    process.exit(command ? 0 : 1);
  }
  if (command !== "upload") {
    console.error(`Unknown command: ${command}\n\n${USAGE}`);
    process.exit(1);
  }

  const args = parseArgs(argv);
  if (!args.zone) {
    console.error("No storage zone. Pass --zone or set BUNNY_STORAGE_ZONE.");
    process.exit(1);
  }
  if (!args.key && !args.dryRun) {
    console.error("No storage password. Pass --key or set BUNNY_STORAGE_KEY.");
    process.exit(1);
  }

  const files = await listFiles(args.dir).catch(() => {
    console.error(`Cannot read ${args.dir}. Run the Astro build first.`);
    process.exit(1);
  });

  if (files.length === 0) {
    console.error(`${args.dir} is empty. Nothing to upload.`);
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`Would upload ${files.length} file(s) to ${args.zone}:`);
    for (const file of files.sort()) console.log(`  ${file}`);
    return;
  }

  console.log(`Uploading ${files.length} file(s) from ${args.dir} to ${args.zone}`);
  let done = 0;
  await pool(files, args.concurrency, async (file) => {
    await upload(args, file);
    done++;
    console.log(`  ${String(done).padStart(String(files.length).length)}/${files.length}  ${file}`);
  });
  console.log("Upload complete.");
}

main().catch((error: unknown) => {
  console.error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
