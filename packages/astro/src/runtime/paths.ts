/**
 * Turning a request path into a Bunny Storage object path.
 *
 * These functions are pure, so the unit tests cover them without a network or a
 * runtime. Path traversal is handled here, because the script holds a storage
 * password and must never let a request reach outside its own zone.
 */

/**
 * Strip the leading slash, decode the path, and drop every traversal segment.
 * `/a/../../etc/passwd` becomes `a/etc/passwd`, which the zone does not hold.
 */
export function toObjectPath(pathname: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed percent sequence is a scanner, not a visitor. Keep it raw;
    // the filter below still removes anything dangerous.
    decoded = pathname;
  }
  return decoded
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part !== "" && part !== "." && part !== "..")
    .join("/");
}

/**
 * The object paths that could answer a request path, best first.
 *
 * A path with a file extension is an asset, and there is one candidate. A path
 * without one may be a prerendered page, which Astro writes as
 * `<route>/index.html` under the default build format, and as `<route>.html`
 * under `build.format: "file"`.
 */
export function objectCandidates(pathname: string): string[] {
  const base = toObjectPath(pathname);
  if (base === "") return ["index.html"];

  const last = base.split("/").pop() ?? "";
  if (last.includes(".")) return [base];

  return [`${base}/index.html`, `${base}.html`];
}

/**
 * The one object that answers this request path, or `null` when the build holds
 * none.
 *
 * The adapter inlines the list of built files, so the script knows the answer
 * without asking Storage. That saves a subrequest on every miss, and a script
 * may only make 50 of them per request.
 */
export function resolveObject(pathname: string, assets: ReadonlySet<string>): string | null {
  for (const candidate of objectCandidates(pathname)) {
    if (assets.has(candidate)) return candidate;
  }
  return null;
}

/**
 * The base URL of a storage zone endpoint.
 *
 * A bare hostname gets HTTPS, which is what every real zone uses. A value that
 * already carries a scheme passes through, so the test emulator can answer on
 * `http://127.0.0.1:8787`.
 */
export function storageBase(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
