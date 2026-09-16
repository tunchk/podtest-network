/**
 * Plain-text with safe http(s) link rendering — no arbitrary HTML.
 */

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

export function extractSafeHttpUrls(text: string): string[] {
  const matches = text.match(URL_RE) ?? [];
  const out: string[] = [];
  for (const raw of matches) {
    try {
      const url = new URL(raw.replace(/[),.;]+$/, ""));
      if (url.protocol === "http:" || url.protocol === "https:") {
        out.push(url.toString());
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

export type TextSegment = { type: "text"; value: string } | { type: "link"; href: string; value: string };

/** Split plain text into safe linkable segments for React rendering. */
export function segmentPlainTextWithLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: "text", value: text.slice(last, match.index) });
    }
    const raw = match[0];
    const trimmed = raw.replace(/[),.;]+$/, "");
    const trailing = raw.slice(trimmed.length);
    try {
      const url = new URL(trimmed);
      if (url.protocol === "http:" || url.protocol === "https:") {
        segments.push({ type: "link", href: url.toString(), value: trimmed });
        if (trailing) segments.push({ type: "text", value: trailing });
      } else {
        segments.push({ type: "text", value: raw });
      }
    } catch {
      segments.push({ type: "text", value: raw });
    }
    last = match.index + raw.length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments.length ? segments : [{ type: "text", value: text }];
}
