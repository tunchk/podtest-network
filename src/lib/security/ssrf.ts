import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 2_500_000;
const DEFAULT_MAX_REDIRECTS = 3;

function fail(code: string, message?: string): never {
  throw Object.assign(new Error(message ?? code), { code });
}

/** Block loopback, private, link-local, CGNAT, and other non-public ranges. */
export function isBlockedIpAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "0.0.0.0") return true;
  if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
  if (v.includes(":")) {
    // IPv6 unique local / site local already partly covered; block IPv4-mapped private.
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isBlockedIpAddress(mapped[1]);
    return false;
  }
  const parts = v.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    fail("INVALID_URL");
  }
  if (url.protocol !== "https:") fail("HTTPS_REQUIRED");
  if (url.username || url.password) fail("URL_CREDENTIALS_FORBIDDEN");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    fail("PRIVATE_HOST");
  }
  if (isIP(host)) {
    if (isBlockedIpAddress(host)) fail("PRIVATE_IP");
  } else {
    let records: { address: string; family: number }[];
    try {
      records = await lookup(host, { all: true, verbatim: true });
    } catch {
      fail("DNS_LOOKUP_FAILED");
    }
    if (!records.length) fail("DNS_LOOKUP_FAILED");
    for (const r of records) {
      if (isBlockedIpAddress(r.address)) fail("PRIVATE_IP");
    }
  }
  return url;
}

export type SafeFetchResult = {
  url: string;
  finalUrl: string;
  body: Buffer;
  contentType: string | null;
};

/**
 * Fetch a public HTTPS resource with SSRF protections, redirect limits,
 * timeouts, and response size caps. Re-validates every redirect hop.
 */
export async function fetchPublicHttps(options: {
  url: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
}): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let current = await assertPublicHttpsUrl(options.url);
  const initial = current.toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: options.accept ?? "application/rss+xml, application/xml, text/xml, */*",
          "User-Agent": "PodTestNetworkRSSImporter/1.0",
        },
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) fail("REDIRECT_MISSING_LOCATION");
        const next = new URL(loc, current);
        current = await assertPublicHttpsUrl(next.toString());
        continue;
      }

      if (!res.ok) fail("FETCH_HTTP_ERROR", `HTTP ${res.status}`);
      const contentType = res.headers.get("content-type");
      const lenHeader = res.headers.get("content-length");
      if (lenHeader && Number(lenHeader) > maxBytes) fail("RESPONSE_TOO_LARGE");

      const reader = res.body?.getReader();
      if (!reader) fail("EMPTY_BODY");
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > maxBytes) fail("RESPONSE_TOO_LARGE");
          chunks.push(value);
        }
      }
      return {
        url: initial,
        finalUrl: current.toString(),
        body: Buffer.concat(chunks.map((c) => Buffer.from(c))),
        contentType,
      };
    } catch (error) {
      if (error instanceof Error && "code" in error) throw error;
      if (error instanceof Error && error.name === "AbortError") fail("FETCH_TIMEOUT");
      fail("FETCH_FAILED", error instanceof Error ? error.message : "fetch failed");
    } finally {
      clearTimeout(timer);
    }
  }
  fail("TOO_MANY_REDIRECTS");
}

/** Validate media/artwork/audio HTTPS URLs for storage (no private hosts). */
export async function sanitizePublicHttpsMediaUrl(raw: string | null | undefined): Promise<string | null> {
  if (!raw?.trim()) return null;
  try {
    const url = await assertPublicHttpsUrl(raw);
    return url.toString();
  } catch {
    return null;
  }
}
