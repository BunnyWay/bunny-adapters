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
 * Node only. It never reaches the deployed script.
 */
import { createServer, type Server } from "node:http";
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
      try {
        const info = await stat(target);
        if (!info.isFile()) throw new Error("not a file");
        size = info.size;
      } catch {
        response.writeHead(404).end('{"HttpCode":404,"Message":"Object not found"}');
        return;
      }

      // The real zone answers with a generic type, and the script sets the
      // right one. Behave the same, so a wrong content type shows up in a test.
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": String(size),
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(target).pipe(response);
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
