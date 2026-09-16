/**
 * Strict HTML allowlist for podcast descriptions.
 * Untrusted RSS HTML → sanitized fragment or plain text.
 */

const ALLOWED_TAGS = new Set(["p", "br", "ul", "ol", "li", "strong", "em", "b", "i", "a"]);

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function htmlToPlainText(html: string): string {
  const withoutTags = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n")
    .replace(/<\s*\/\s*li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return decodeBasicEntities(withoutTags);
}

function sanitizeHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Returns sanitized HTML fragment or empty string. Never includes script/style/iframe. */
export function sanitizePodcastHtml(html: string, maxLen = 50_000): string {
  if (!html.trim()) return "";
  const input = html.slice(0, maxLen);
  let out = "";
  const re = /<\/?([a-zA-Z0-9]+)(\s[^>]*)?>|([^<]+)/g;
  let m: RegExpExecArray | null;
  const openStack: string[] = [];
  while ((m = re.exec(input))) {
    if (m[3] != null) {
      out += m[3]
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      continue;
    }
    const tag = (m[1] ?? "").toLowerCase();
    const full = m[0];
    const closing = full.startsWith("</");
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (tag === "br") {
      out += "<br />";
      continue;
    }
    if (closing) {
      if (openStack[openStack.length - 1] === tag) {
        openStack.pop();
        out += `</${tag}>`;
      }
      continue;
    }
    if (tag === "a") {
      const hrefMatch = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(full);
      const href = sanitizeHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "");
      if (!href) continue;
      out += `<a href="${href}" rel="noopener noreferrer" target="_blank">`;
      openStack.push("a");
      continue;
    }
    out += `<${tag}>`;
    openStack.push(tag);
  }
  while (openStack.length) {
    out += `</${openStack.pop()}>`;
  }
  return out.trim();
}

export function mergeManualOverrides(
  existing: unknown,
  changedFields: string[],
): Record<string, boolean> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, boolean>) }
      : {};
  for (const f of changedFields) base[f] = true;
  return base;
}

/** open.spotify.com episode URLs only — never invent from podcasters.spotify.com. */
export function sanitizeSpotifyEpisodeUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host !== "open.spotify.com" && host !== "www.open.spotify.com") return null;
    if (!/^\/episode\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
