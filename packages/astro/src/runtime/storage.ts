/**
 * A small Bunny Storage client.
 *
 * The script uses it to read the client build. The session driver uses it to
 * read and write session data. It speaks the Storage HTTP API directly, because
 * an SDK would cost start-up time the script does not have.
 *
 * @see https://bunny.net/docs/storage/http
 */
import { storageBase } from "./paths.js";

export interface StorageConfig {
  /** Zone name, for example `my-site-assets`. */
  zone: string;
  /** Regional endpoint, for example `storage.bunnycdn.com`, or a full URL. */
  host: string;
  /** Zone password. Read-only is enough to serve a site. */
  key: string;
}

export interface StorageClient {
  /** True when a zone is configured at all. */
  readonly enabled: boolean;
  /**
   * Fetch one object. Returns `null` when the zone does not hold it.
   *
   * `forward` carries the request headers that refine the fetch, such as
   * `Range` and `If-None-Match`. Bunny Storage answers all of them, so the
   * script does not have to read a whole object to serve a slice of it.
   */
  get(object: string, forward?: HeadersInit): Promise<Response | null>;
  /** Write one object. Throws when the zone rejects the write. */
  put(object: string, body: BodyInit, type?: string): Promise<void>;
  /** Remove one object. Returns false when it was already absent. */
  delete(object: string): Promise<boolean>;
}

export function createStorage(config: StorageConfig): StorageClient {
  const base = config.zone ? `${storageBase(config.host)}/${config.zone}` : "";
  const headers = config.key ? { AccessKey: config.key } : undefined;

  return {
    enabled: Boolean(config.zone),

    async get(object, forward) {
      if (!base) return null;

      const request = new Headers(forward);
      if (config.key) request.set("AccessKey", config.key);

      const response = await fetch(`${base}/${object}`, { headers: request });

      // 206 is already ok. The other two say the object is there and the
      // request asked for something particular about it, so both are answers
      // the visitor should get rather than a miss.
      if (response.ok || response.status === 304 || response.status === 416) return response;

      // Drain the body. An unread body holds the connection open, and the
      // isolate has a small subrequest budget.
      await response.body?.cancel();
      return null;
    },

    async put(object, body, type = "application/octet-stream") {
      if (!base) throw new Error("No storage zone is configured.");
      const response = await fetch(`${base}/${object}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": type },
        body,
      });
      await response.body?.cancel();
      if (!response.ok) {
        throw new Error(`Storage write failed for ${object}: ${response.status}`);
      }
    },

    async delete(object) {
      if (!base) return false;
      const response = await fetch(`${base}/${object}`, { method: "DELETE", headers });
      await response.body?.cancel();
      return response.ok;
    },
  };
}
