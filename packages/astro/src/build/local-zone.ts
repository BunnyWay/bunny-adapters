/**
 * A Bunny Storage zone, served from a local folder.
 *
 * The script reads its assets, its prerendered pages and its sessions from a
 * storage zone. That would make `astro preview` need a real zone, and it would
 * make the test suite need an account. This stands in for both.
 *
 * It answers the same shapes as the real
 * [Storage HTTP API](https://bunny.net/docs/storage/http): `GET`, `PUT` and
 * `DELETE` on `/{zone}/{object}`. It ignores the access key, because nothing
 * here is private.
 *
 * It answers a `Range` request the way the real zone does, with `206` and a
 * `Content-Range`, or `416` when the range is outside the object. It sends an
 * `ETag` and a `Last-Modified`, and it answers `304` to a conditional request.
 * A test can then prove the script passes all of that through, instead of
 * assuming it does.
 *
 * Node only. It never reaches the deployed script.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";

export interface LocalZone {
  /** Zone name the script should use. */
  zone: string;
  /** Endpoint to give the script, scheme included. */
  host: string;
  /** Stop listening. */
  close(): Promise<void>;
}

export interface LocalZoneOptions {
  /** Folder to serve. Usually `dist/client`. */
  dir: string;
  /** Zone name to answer for. Any other name gets a 404. @default "preview" */
  zone?: string;
  /** Port to listen on. Zero picks a free one. @default 0 */
  port?: number;
  /** Allow writes, which sessions need. @default true */
  writable?: boolean;
}

/**
 * The byte range a request asks for, out of an object of `size` bytes.
 *
 * Returns `null` when the header asks for nothing we handle, which means the
 * whole object, and `"unsatisfiable"` when it asks for bytes that are not
 * there. Only a single range is handled; the real zone answers a multi-range
 * request with the whole object too.
 */
function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    // "bytes=-500" is the last 500 bytes.
    const length = Number(rawEnd);
    if (length === 0) return "unsatisfiable";
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

/**
 * True when the request already holds this version of the object.
 *
 * `If-None-Match` wins over `If-Modified-Since`, which is what the standard
 * asks for and what the real zone does.
 */
function isUnchanged(headers: IncomingHttpHeaders, etag: string, lastModified: string): boolean {
  const noneMatch = headers["if-none-match"];
  if (typeof noneMatch === "string") {
    return noneMatch
      .split(",")
      .some((candidate) => candidate.trim() === etag || candidate.trim() === "*");
  }

  const since = headers["if-modified-since"];
  if (typeof since === "string") {
    const asked = Date.parse(since);
    return Number.isFinite(asked) && Date.parse(lastModified) <= asked;
  }
  return false;
}

/**
 * Resolve an object path inside the folder.
 * Returns `null` for anything that climbs out of it.
 */
function resolveSafely(dir: string, object: string): string | null {
  const target = path.resolve(dir, object);
  const root = path.resolve(dir);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

export async function startLocalZone(options: LocalZoneOptions): Promise<LocalZone> {
  const zone = options.zone ?? "preview";
  const dir = path.resolve(options.dir);
  const writable = options.writable ?? true;

  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

      if (segments.shift() !== zone) {
        response.writeHead(404).end('{"HttpCode":404,"Message":"Zone not found"}');
        return;
      }

      const object = segments.join("/");
      const target = object ? resolveSafely(dir, object) : null;
      if (!target) {
        response.writeHead(400).end('{"HttpCode":400,"Message":"Invalid path"}');
        return;
      }

      if (request.method === "PUT") {
        if (!writable) {
          response.writeHead(401).end('{"HttpCode":401,"Message":"Unauthorized"}');
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk as Buffer);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, Buffer.concat(chunks));
        response.writeHead(201).end('{"HttpCode":201,"Message":"File uploaded."}');
        return;
      }

      if (request.method === "DELETE") {
        try {
          await rm(target);
          response.writeHead(200).end('{"HttpCode":200,"Message":"File deleted."}');
        } catch {
          response.writeHead(404).end('{"HttpCode":404,"Message":"Object not found"}');
        }
        return;
      }

      let size: number;
      let modified: Date;
      try {
        const info = await stat(target);
        if (!info.isFile()) throw new Error("not a file");
        size = info.size;
        modified = info.mtime;
      } catch {
        response.writeHead(404).end('{"HttpCode":404,"Message":"Object not found"}');
        return;
      }

      // The real zone sends both, in this shape: the modification time and the
      // size, in hexadecimal. A browser and a pull zone both revalidate with
      // them, so a script that dropped them would re-download every object.
      const lastModified = new Date(Math.floor(modified.getTime() / 1000) * 1000).toUTCString();
      const etag = `"${Math.floor(modified.getTime() / 1000).toString(16)}-${size.toString(16)}"`;

      if (isUnchanged(request.headers, etag, lastModified)) {
        response.writeHead(304, { etag, "last-modified": lastModified }).end();
        return;
      }

      const validators = { etag, "last-modified": lastModified };
      const range = parseRange(request.headers.range, size);

      if (range === "unsatisfiable") {
        response.writeHead(416, {
          ...validators,
          "content-range": `bytes */${size}`,
          "accept-ranges": "bytes",
        });
        response.end();
        return;
      }

      // The script works the content type out from the object's extension, and
      // it overrides whatever Storage said. The real zone does send a type, and
      // this one deliberately sends the wrong one, so a script that trusted it
      // would fail a test here.
      const headers: Record<string, string> = {
        ...validators,
        "content-type": "application/octet-stream",
        "accept-ranges": "bytes",
        "content-length": String(range ? range.end - range.start + 1 : size),
      };
      if (range) headers["content-range"] = `bytes ${range.start}-${range.end}/${size}`;

      response.writeHead(range ? 206 : 200, headers);
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(target, range ? { start: range.start, end: range.end } : undefined).pipe(
        response,
      );
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end('{"HttpCode":500,"Message":"Emulator error"}');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", resolve);
  });

  const port = (server.address() as AddressInfo).port;

  return {
    zone,
    host: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
