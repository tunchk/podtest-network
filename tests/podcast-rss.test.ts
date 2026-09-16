import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { parsePodcastRssXml } from "@/lib/podcast/rss-parse";
import { sanitizeSpotifyEpisodeUrl, sanitizePodcastHtml, htmlToPlainText } from "@/lib/podcast/sanitize";
import { isBlockedIpAddress } from "@/lib/security/ssrf";
import {
  createPodcastEpisode,
  updatePodcastEpisode,
  listPublishedEpisodes,
  getPublishedEpisodeBySlug,
} from "@/lib/community/episodes";
import { importRssFeed, previewRssFeed } from "@/lib/podcast/rss-import";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `rss-${Date.now().toString(36)}`;

function sampleFeed(options?: { guid?: string; title?: string; enclosure?: string }) {
  const guid = options?.guid ?? `guid-${suffix}`;
  const title = options?.title ?? `Episode ${suffix}`;
  const enclosure =
    options?.enclosure ?? `https://cdn.example.com/audio/${suffix}.m4a`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>PodTest Test Feed</title>
    <atom:link href="https://example.com/feed-${suffix}.xml" rel="self" type="application/rss+xml"/>
    <item>
      <title><![CDATA[${title}]]></title>
      <description><![CDATA[<p>Hello <script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://example.com/ok">ok</a></p>]]></description>
      <guid isPermaLink="false">${guid}</guid>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <enclosure url="${enclosure}" type="audio/x-m4a" length="1"/>
      <itunes:duration>00:12:34</itunes:duration>
      <itunes:episode>3</itunes:episode>
      <itunes:season>2</itunes:season>
      <link>https://podcasters.spotify.com/pod/show/test/episodes/ep-${suffix}</link>
    </item>
    <item>
      <title>No identity</title>
      <description>skip me</description>
    </item>
  </channel>
</rss>`;
}

describe("podcast RSS import", () => {
  let admin = "";

  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        name: "RSS Admin",
        email: `rss-admin-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "ADMIN",
      },
    });
    admin = user.id;
  });

  afterAll(async () => {
    await db.podcastEpisode.deleteMany({ where: { createdById: admin } });
    await db.podcastFeedConfig.deleteMany({ where: { updatedById: admin } });
    await db.user.delete({ where: { id: admin } });
    await db.$disconnect();
  });

  it("parses feed and sanitizes HTML", () => {
    const feed = parsePodcastRssXml(sampleFeed());
    expect(feed.title).toBe("PodTest Test Feed");
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0]?.identitySource).toBe("guid");
    expect(feed.items[0]?.durationSeconds).toBe(12 * 60 + 34);
    expect(feed.items[0]?.episodeNumber).toBe(3);
    expect(feed.items[0]?.seasonNumber).toBe(2);
    expect(feed.items[1]?.skipReason).toBeTruthy();
    expect(feed.items[0]?.descriptionHtml).not.toContain("script");
    expect(feed.items[0]?.descriptionHtml).toContain("https://example.com/ok");
    expect(feed.items[0]?.descriptionHtml).not.toContain("javascript:");
  });

  it("rejects non-Spotify and unsafe hosts", () => {
    expect(sanitizeSpotifyEpisodeUrl("https://podcasters.spotify.com/pod/show/x")).toBeNull();
    expect(sanitizeSpotifyEpisodeUrl("https://open.spotify.com/episode/abc123")).toBe(
      "https://open.spotify.com/episode/abc123",
    );
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("10.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(htmlToPlainText("<p>a<br>b</p>")).toContain("a");
    expect(sanitizePodcastHtml('<img src=x onerror=alert(1)><p>hi</p>')).toBe("<p>hi</p>");
  });

  it("preserves manual overrides and hidden state on refresh fields", async () => {
    const ep = await createPodcastEpisode({
      adminId: admin,
      series: "Manual",
      title: `Manual ${suffix}`,
      listeningUrl: `https://example.com/manual-${suffix}`,
      publicationState: "REMOVED",
    });
    await updatePodcastEpisode({
      adminId: admin,
      episodeId: ep.id,
      title: `Curated ${suffix}`,
    });
    const updated = await db.podcastEpisode.findUniqueOrThrow({ where: { id: ep.id } });
    expect((updated.manualOverrides as Record<string, boolean>).title).toBe(true);
    expect(updated.publicationState).toBe("REMOVED");
    const pub = await listPublishedEpisodes();
    expect(pub.items.find((i) => i.id === ep.id)).toBeUndefined();
  });

  it("denies non-admin preview", async () => {
    const member = await db.user.create({
      data: {
        name: "RSS Member",
        email: `rss-member-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    await expect(previewRssFeed({ adminId: member.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await db.user.delete({ where: { id: member.id } });
  });

  it("getPublishedEpisodeBySlug hides drafts", async () => {
    const draft = await createPodcastEpisode({
      adminId: admin,
      series: "PodTest",
      title: `Draft slug ${suffix}`,
      publicationState: "DRAFT",
    });
    expect(await getPublishedEpisodeBySlug(draft.slug)).toBeNull();
  });
});

describe("podcast RSS parse edge cases", () => {
  it("uses enclosure fallback when guid missing", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
      <item><title>A</title><enclosure url="https://cdn.example.com/a.mp3" type="audio/mpeg"/></item>
    </channel></rss>`;
    const feed = parsePodcastRssXml(xml);
    expect(feed.items[0]?.identitySource).toBe("enclosure");
    expect(feed.items[0]?.identity).toBe("https://cdn.example.com/a.mp3");
  });

  it("rejects malformed xml", () => {
    expect(() => parsePodcastRssXml("<not-rss")).toThrow();
  });
});

// Keep importRssFeed unused import check for type surface in admin path
void importRssFeed;
