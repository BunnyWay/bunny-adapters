/**
 * A small Bunny Storage client.
 *
 * The script uses it to read the client build. The session driver uses it to
 * read and write session data. It speaks the Storage HTTP API directly, because
 * an SDK would cost start-up time the script does not have.
 *
 * @see https://bunny.net/docs/storage/http
 */
import { encodeObjectPath, storageBase } from "./paths.js";

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

  /** The URL for one object. Every caller goes through this, so nothing skips
   * the encoding that keeps a request inside the zone. */
  const urlFor = (object: string): string => `${base}/${encodeObjectPath(object)}`;

  // A refused zone breaks every request, so the cause is worth one line. Say it
  // once per isolate; repeating it on every request would bury the rest of the
  // log without adding anything.
  let refusalReported = false;
  const reportRefusal = (status: number, object: string): void => {
    if (refusalReported) return;
    refusalReported = true;
    console.error(
      `Bunny Storage answered ${status} for "${object}" in zone "${config.zone}". ` +
        "Check that BUNNY_STORAGE_KEY is a password of that zone, and that " +
        "BUNNY_STORAGE_HOST matches its region. Until then every stored path answers 404.",
    );
  };

  return {
    enabled: Boolean(config.zone),

    async get(object, forward) {
      if (!base) return null;

      const request = new Headers(forward);
      if (config.key) request.set("AccessKey", config.key);

      const response = await fetch(urlFor(object), { headers: request });

      // 206 is already ok. The other two say the object is there and the
      // request asked for something particular about it, so both are answers
      // the visitor should get rather than a miss.
      if (response.ok || response.status === 304 || response.status === 416) return response;

      // A 401 or a 403 is a broken configuration, not a missing object. The
      // visitor still gets a 404, because there is nothing else to give them.
      if (response.status === 401 || response.status === 403) {
        reportRefusal(response.status, object);
      }

      // Drain the body. An unread body holds the connection open, and the
      // isolate has a small subrequest budget.
      await response.body?.cancel();
      return null;
    },

    async put(object, body, type = "application/octet-stream") {
      if (!base) throw new Error("No storage zone is configured.");
      const response = await fetch(urlFor(object), {
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
      const response = await fetch(urlFor(object), { method: "DELETE", headers });
      await response.body?.cancel();
      return response.ok;
    },
  };
}
