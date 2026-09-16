import { XMLParser } from "fast-xml-parser";
import { htmlToPlainText, sanitizePodcastHtml } from "@/lib/podcast/sanitize";

export const DEFAULT_PODCAST_RSS_URL = "https://anchor.fm/s/fc208fd0/podcast/rss";
export const RSS_MAX_ITEMS = Number(process.env.PODCAST_RSS_MAX_ITEMS ?? "500");

export type ParsedRssItem = {
  guid: string | null;
  guidFallback: string | null;
  identity: string | null;
  identitySource: "guid" | "enclosure" | null;
  skipReason: string | null;
  title: string;
  descriptionPlain: string;
  descriptionHtml: string;
  publicationDate: Date | null;
  link: string | null;
  audioUrl: string | null;
  audioType: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
  episodeNumber: number | null;
  seasonNumber: number | null;
};

export type ParsedRssFeed = {
  title: string;
  descriptionPlain: string;
  feedIdentity: string | null;
  link: string | null;
  artworkUrl: string | null;
  items: ParsedRssItem[];
  truncated: boolean;
  parseWarnings: string[];
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node === "object" && node !== null) {
    const o = node as Record<string, unknown>;
    if ("#text" in o) return textOf(o["#text"]);
    if ("@" in o && Object.keys(o).length === 1) return "";
  }
  return "";
}

function attr(node: unknown, name: string): string | null {
  if (!node || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  const v = o[`@_${name}`] ?? o[`@${name}`];
  return v == null ? null : String(v);
}

function parseDuration(raw: string | null): number | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return null;
}

function parseOptionalInt(raw: string | null): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function pickAtomSelfHref(channel: Record<string, unknown>): string | null {
  const links = asArray(channel["atom:link"] ?? channel.link);
  for (const link of links) {
    if (typeof link === "string") continue;
    const rel = attr(link, "rel");
    const href = attr(link, "href");
    if (rel === "self" && href) return href;
  }
  return null;
}

export function parsePodcastRssXml(xml: string): ParsedRssFeed {
  const warnings: string[] = [];
  // fast-xml-parser does not resolve external entities / DTDs.
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    processEntities: true,
    htmlEntities: true,
    allowBooleanAttributes: true,
  });

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error("MALFORMED_XML"), { code: "MALFORMED_XML" });
  }

  const rss = (doc.rss ?? doc.feed) as Record<string, unknown> | undefined;
  if (!rss) {
    throw Object.assign(new Error("NOT_RSS"), { code: "NOT_RSS" });
  }
  const channel = (rss.channel ?? rss) as Record<string, unknown>;
  const title = textOf(channel.title).trim() || "Untitled feed";
  const descriptionRaw = textOf(channel.description) || textOf(channel["itunes:summary"]);
  const feedIdentity = pickAtomSelfHref(channel);
  const artworkUrl =
    attr(channel["itunes:image"], "href") ||
    attr(asArray(channel.image)[0], "url") ||
    textOf((asArray(channel.image)[0] as { url?: unknown } | undefined)?.url) ||
    null;

  const rawItems = asArray(channel.item);
  const truncated = rawItems.length > RSS_MAX_ITEMS;
  if (truncated) {
    warnings.push(`Feed has ${rawItems.length} items; only first ${RSS_MAX_ITEMS} are considered.`);
  }

  const items: ParsedRssItem[] = rawItems.slice(0, RSS_MAX_ITEMS).map((raw) => {
    const item = raw as Record<string, unknown>;
    const itemTitle = textOf(item.title).trim() || "Untitled episode";
    const descRaw =
      textOf(item["content:encoded"]) ||
      textOf(item.description) ||
      textOf(item["itunes:summary"]) ||
      "";
    const enclosure = asArray(item.enclosure)[0];
    const audioUrl = attr(enclosure, "url");
    const audioType = attr(enclosure, "type");
    const guid =
      (typeof item.guid === "object" && item.guid != null
        ? textOf(item.guid).trim()
        : textOf(item.guid).trim()) || null;

    let identity: string | null = null;
    let identitySource: ParsedRssItem["identitySource"] = null;
    let skipReason: string | null = null;
    let guidFallback: string | null = null;

    if (guid) {
      identity = guid;
      identitySource = "guid";
    } else if (audioUrl?.trim()) {
      identity = audioUrl.trim();
      identitySource = "enclosure";
      guidFallback = audioUrl.trim();
    } else {
      skipReason =
        "Missing GUID and enclosure URL — item is ambiguous and will be skipped on import.";
    }

    const pubRaw = textOf(item.pubDate) || textOf(item["dc:date"]);
    let publicationDate: Date | null = null;
    if (pubRaw) {
      const d = new Date(pubRaw);
      if (!Number.isNaN(d.getTime())) publicationDate = d;
      else warnings.push(`Invalid pubDate for “${itemTitle}”`);
    }

    const link = textOf(item.link).trim() || null;
    const artwork =
      attr(item["itunes:image"], "href") || artworkUrl;

    return {
      guid,
      guidFallback,
      identity,
      identitySource,
      skipReason,
      title: itemTitle.slice(0, 500),
      descriptionPlain: htmlToPlainText(descRaw).slice(0, 20_000),
      descriptionHtml: sanitizePodcastHtml(descRaw),
      publicationDate,
      link,
      audioUrl: audioUrl?.trim() || null,
      audioType,
      artworkUrl: artwork,
      durationSeconds: parseDuration(textOf(item["itunes:duration"]) || null),
      episodeNumber: parseOptionalInt(textOf(item["itunes:episode"]) || null),
      seasonNumber: parseOptionalInt(textOf(item["itunes:season"]) || null),
    };
  });

  // Do not surface feed-owner email anywhere in parsed public fields.
  return {
    title: title.slice(0, 300),
    descriptionPlain: htmlToPlainText(descriptionRaw).slice(0, 5000),
    feedIdentity,
    link: textOf(channel.link).trim() || null,
    artworkUrl,
    items,
    truncated,
    parseWarnings: warnings,
  };
}
