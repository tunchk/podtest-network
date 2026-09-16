import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { fetchPublicHttps, sanitizePublicHttpsMediaUrl } from "@/lib/security/ssrf";
import { sanitizeExternalUrl } from "@/lib/security/urls";
import { mergeManualOverrides } from "@/lib/podcast/sanitize";
import { sanitizeSpotifyEpisodeUrl } from "@/lib/podcast/sanitize";
import {
  DEFAULT_PODCAST_RSS_URL,
  parsePodcastRssXml,
  type ParsedRssFeed,
  type ParsedRssItem,
} from "@/lib/podcast/rss-parse";
import type { PodcastEpisode, Prisma } from "@/generated/prisma/client";

export { DEFAULT_PODCAST_RSS_URL };
export { mergeManualOverrides } from "@/lib/podcast/sanitize";

function fail(code: string, message?: string): never {
  throw Object.assign(new Error(message ?? code), { code });
}

async function requireAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { staffRole: true },
  });
  if (!user || user.staffRole !== "ADMIN") fail("FORBIDDEN");
}

function slugify(title: string, salt: string) {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  const hash = createHash("sha256").update(salt).digest("hex").slice(0, 8);
  return `${base || "bolum"}-${hash}`;
}

function overridesOf(episode: Pick<PodcastEpisode, "manualOverrides">): Set<string> {
  const raw = episode.manualOverrides;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Set();
  return new Set(
    Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k),
  );
}

type MediaFields = {
  audioUrl: string | null;
  artworkUrl: string | null;
  listeningUrl: string | null;
};

async function mediaFields(item: ParsedRssItem): Promise<MediaFields> {
  const [audioUrl, artworkUrl] = await Promise.all([
    sanitizePublicHttpsMediaUrl(item.audioUrl),
    sanitizePublicHttpsMediaUrl(item.artworkUrl),
  ]);
  let listeningUrl: string | null = null;
  if (item.link) {
    listeningUrl = sanitizeExternalUrl(item.link);
  }
  return { audioUrl, artworkUrl, listeningUrl };
}

function snapshotFromItem(item: ParsedRssItem, series: string, media: MediaFields) {
  return {
    series,
    title: item.title,
    description: item.descriptionPlain || null,
    descriptionHtml: item.descriptionHtml || null,
    publicationDate: item.publicationDate?.toISOString() ?? null,
    listeningUrl: media.listeningUrl,
    artworkUrl: media.artworkUrl,
    audioUrl: media.audioUrl,
    durationSeconds: item.durationSeconds,
    episodeNumber: item.episodeNumber,
    seasonNumber: item.seasonNumber,
  };
}

export async function getOrInitFeedConfig(adminId: string) {
  await requireAdmin(adminId);
  const existing = await prisma.podcastFeedConfig.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return {
    id: null as string | null,
    feedUrl: DEFAULT_PODCAST_RSS_URL,
    feedIdentity: null as string | null,
    feedTitle: null as string | null,
    lastFetchedAt: null as Date | null,
    lastFetchStatus: null as string | null,
    lastFetchError: null as string | null,
    lastItemCount: null as number | null,
  };
}

export async function saveFeedUrl(options: { adminId: string; feedUrl: string }) {
  await requireAdmin(options.adminId);
  const url = sanitizeExternalUrl(options.feedUrl);
  if (!url || !url.startsWith("https://")) fail("INVALID_URL");

  const existing = await prisma.podcastFeedConfig.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) {
    // Updating URL is explicit admin save — never happens implicitly on preview.
    return prisma.podcastFeedConfig.update({
      where: { id: existing.id },
      data: { feedUrl: url, updatedById: options.adminId },
    });
  }
  return prisma.podcastFeedConfig.create({
    data: { feedUrl: url, updatedById: options.adminId },
  });
}

export type RssPreviewResult = {
  feedUrl: string;
  feedTitle: string;
  feedIdentity: string | null;
  itemCount: number;
  truncated: boolean;
  parseWarnings: string[];
  counts: { new: number; update: number; skip: number; conflict: number };
  validationErrors: string[];
  conflicts: Array<{
    identity: string;
    title: string;
    matchedEpisodeId: string;
    matchedTitle: string;
    reason: string;
  }>;
  skipped: Array<{ title: string; reason: string }>;
  publishNote: string;
};

async function loadFeedXml(feedUrl: string) {
  const fetched = await fetchPublicHttps({
    url: feedUrl,
    accept: "application/rss+xml, application/xml, text/xml, */*",
  });
  const xml = fetched.body.toString("utf8");
  if (/<!DOCTYPE/i.test(xml) && /<!ENTITY/i.test(xml)) {
    fail("UNSAFE_XML_DTD");
  }
  return { xml, finalUrl: fetched.finalUrl };
}

async function classifyItems(feed: ParsedRssFeed, feedConfigId: string | null) {
  const conflicts: RssPreviewResult["conflicts"] = [];
  const skipped: RssPreviewResult["skipped"] = [];
  let newCount = 0;
  let updateCount = 0;

  const existingByGuid = feedConfigId
    ? await prisma.podcastEpisode.findMany({
        where: { feedConfigId, rssGuid: { not: null } },
        select: { id: true, title: true, rssGuid: true },
      })
    : [];
  const guidMap = new Map(existingByGuid.map((e) => [e.rssGuid!, e]));

  for (const item of feed.items) {
    if (!item.identity || item.skipReason) {
      skipped.push({ title: item.title, reason: item.skipReason ?? "Missing identity" });
      continue;
    }
    if (guidMap.has(item.identity)) {
      updateCount += 1;
      continue;
    }

    const orFilters: Prisma.PodcastEpisodeWhereInput[] = [];
    if (item.audioUrl) orFilters.push({ audioUrl: item.audioUrl });
    if (item.link) orFilters.push({ listeningUrl: item.link });
    const urlMatches =
      orFilters.length === 0
        ? []
        : await prisma.podcastEpisode.findMany({
            where: { rssGuid: null, OR: orFilters },
            select: { id: true, title: true },
            take: 5,
          });

    if (urlMatches.length === 1) {
      conflicts.push({
        identity: item.identity,
        title: item.title,
        matchedEpisodeId: urlMatches[0]!.id,
        matchedTitle: urlMatches[0]!.title,
        reason:
          "Exact URL match to an existing catalog episode without RSS identity. Confirm link-on-import to attach GUID.",
      });
      continue;
    }
    if (urlMatches.length > 1) {
      conflicts.push({
        identity: item.identity,
        title: item.title,
        matchedEpisodeId: urlMatches[0]!.id,
        matchedTitle: urlMatches.map((m) => m.title).join(" | "),
        reason: "Ambiguous URL matches — will not auto-merge by title.",
      });
      continue;
    }
    newCount += 1;
  }

  return {
    counts: {
      new: newCount,
      update: updateCount,
      skip: skipped.length,
      conflict: conflicts.length,
    },
    validationErrors: [] as string[],
    conflicts,
    skipped,
  };
}

export async function previewRssFeed(options: {
  adminId: string;
  feedUrl?: string;
}): Promise<RssPreviewResult> {
  await requireAdmin(options.adminId);
  const config = await getOrInitFeedConfig(options.adminId);
  // Prefill default when none configured; do not overwrite stored URL here.
  const feedUrl = (options.feedUrl?.trim() || config.feedUrl || DEFAULT_PODCAST_RSS_URL).trim();
  if (!feedUrl.startsWith("https://")) fail("HTTPS_REQUIRED");

  try {
    const { xml } = await loadFeedXml(feedUrl);
    const feed = parsePodcastRssXml(xml);
    const classified = await classifyItems(feed, config.id);

    if (config.id) {
      await prisma.podcastFeedConfig.update({
        where: { id: config.id },
        data: {
          lastFetchedAt: new Date(),
          lastFetchStatus: "preview_ok",
          lastFetchError: null,
          lastItemCount: feed.items.length,
          feedTitle: feed.title,
          ...(feed.feedIdentity && !config.feedIdentity
            ? { feedIdentity: feed.feedIdentity }
            : {}),
          updatedById: options.adminId,
        },
      });
    }

    return {
      feedUrl,
      feedTitle: feed.title,
      feedIdentity: feed.feedIdentity,
      itemCount: feed.items.length,
      truncated: feed.truncated,
      parseWarnings: feed.parseWarnings,
      ...classified,
      publishNote:
        "İçe aktarım onayı, bu sahip kontrollü yayından yeni bölümleri PUBLISHED olarak ekleyebilir. Gizli/REMOVED bölümler otomatik yeniden yayımlanmaz. Akışta artık olmayan öğeler silinmez veya yayından kaldırılmaz.",
    };
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: string }).code)
        : "FETCH_FAILED";
    const message = error instanceof Error ? error.message : "fetch failed";
    if (config.id) {
      await prisma.podcastFeedConfig.update({
        where: { id: config.id },
        data: {
          lastFetchedAt: new Date(),
          lastFetchStatus: "preview_error",
          lastFetchError: `${code}: ${message}`.slice(0, 500),
          updatedById: options.adminId,
        },
      });
    }
    throw error;
  }
}

export type ImportResolution = {
  identity: string;
  action: "link" | "skip";
  episodeId?: string;
};

export type RssImportResult = {
  feedTitle: string;
  itemCount: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  linked: number;
  failures: Array<{ title: string; reason: string }>;
};

export async function importRssFeed(options: {
  adminId: string;
  feedUrl?: string;
  publishNew?: boolean;
  resolutions?: ImportResolution[];
}): Promise<RssImportResult> {
  await requireAdmin(options.adminId);
  const publishNew = options.publishNew !== false;
  const resolutionMap = new Map((options.resolutions ?? []).map((r) => [r.identity, r] as const));

  let config = await prisma.podcastFeedConfig.findFirst({ orderBy: { createdAt: "asc" } });
  const feedUrl = (options.feedUrl?.trim() || config?.feedUrl || DEFAULT_PODCAST_RSS_URL).trim();

  let xml: string;
  try {
    ({ xml } = await loadFeedXml(feedUrl));
  } catch (error) {
    if (config) {
      await prisma.podcastFeedConfig.update({
        where: { id: config.id },
        data: {
          lastFetchedAt: new Date(),
          lastFetchStatus: "import_error",
          lastFetchError:
            error instanceof Error && "code" in error
              ? String((error as { code: string }).code)
              : "FETCH_FAILED",
          updatedById: options.adminId,
        },
      });
    }
    throw error;
  }

  const feed = parsePodcastRssXml(xml);
  const series = feed.title || "PodTest";

  // Validate media URLs outside the write transaction.
  const prepared: Array<{ item: ParsedRssItem; media: MediaFields }> = [];
  for (const item of feed.items) {
    prepared.push({ item, media: await mediaFields(item) });
  }

  if (!config) {
    config = await prisma.podcastFeedConfig.create({
      data: {
        feedUrl,
        feedTitle: feed.title,
        feedIdentity: feed.feedIdentity,
        updatedById: options.adminId,
      },
    });
  }

  const result: RssImportResult = {
    feedTitle: feed.title,
    itemCount: feed.items.length,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    linked: 0,
    failures: [],
  };

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"podcast-rss-import"}))`;

      for (const { item, media } of prepared) {
        try {
          if (!item.identity || item.skipReason) {
            result.skipped += 1;
            continue;
          }

          const snap = snapshotFromItem(item, series, media);
          const existing = await tx.podcastEpisode.findFirst({
            where: { feedConfigId: config!.id, rssGuid: item.identity },
          });

          if (existing) {
            const overridden = overridesOf(existing);
            const confirmedGuests = await tx.episodeAppearance.count({
              where: { episodeId: existing.id, status: "CONFIRMED" },
            });
            // Guest-approved publication versions must not be silently rewritten by RSS refresh.
            const lockMaterial = confirmedGuests > 0;
            const data: Prisma.PodcastEpisodeUpdateInput = {
              importedSnapshot: snap,
              sourceKind: "RSS",
            };
            if (!lockMaterial && !overridden.has("series")) data.series = series;
            if (!lockMaterial && !overridden.has("title")) data.title = item.title;
            if (!lockMaterial && !overridden.has("description")) {
              data.description = item.descriptionPlain || null;
            }
            if (!lockMaterial && !overridden.has("descriptionHtml")) {
              data.descriptionHtml = item.descriptionHtml || null;
            }
            if (!lockMaterial && !overridden.has("publicationDate")) {
              data.publicationDate = item.publicationDate;
            }
            if (!lockMaterial && !overridden.has("listeningUrl")) {
              data.listeningUrl = media.listeningUrl;
            }
            if (!lockMaterial && !overridden.has("artworkUrl")) {
              data.artworkUrl = media.artworkUrl;
            }
            if (!lockMaterial && !overridden.has("audioUrl")) data.audioUrl = media.audioUrl;
            if (!lockMaterial && !overridden.has("durationSeconds")) {
              data.durationSeconds = item.durationSeconds;
            }
            if (!lockMaterial && !overridden.has("episodeNumber")) {
              data.episodeNumber = item.episodeNumber;
            }
            if (!lockMaterial && !overridden.has("seasonNumber")) {
              data.seasonNumber = item.seasonNumber;
            }
            // publicationState intentionally untouched on refresh
            await tx.podcastEpisode.update({ where: { id: existing.id }, data });
            result.updated += 1;
            continue;
          }

          const resolution = resolutionMap.get(item.identity);
          if (resolution?.action === "skip") {
            result.skipped += 1;
            continue;
          }

          const orFilters: Prisma.PodcastEpisodeWhereInput[] = [];
          if (media.audioUrl) orFilters.push({ audioUrl: media.audioUrl });
          if (media.listeningUrl) orFilters.push({ listeningUrl: media.listeningUrl });
          const urlMatches =
            orFilters.length === 0
              ? []
              : await tx.podcastEpisode.findMany({
                  where: { rssGuid: null, OR: orFilters },
                  take: 5,
                });

          if (urlMatches.length > 1) {
            result.skipped += 1;
            result.failures.push({ title: item.title, reason: "Ambiguous URL match — skipped" });
            continue;
          }

          if (urlMatches.length === 1) {
            if (resolution?.action === "link" && resolution.episodeId === urlMatches[0]!.id) {
              const ep = urlMatches[0]!;
              const overridden = overridesOf(ep);
              const confirmedGuests = await tx.episodeAppearance.count({
                where: { episodeId: ep.id, status: "CONFIRMED" },
              });
              const lockMaterial = confirmedGuests > 0;
              await tx.podcastEpisode.update({
                where: { id: ep.id },
                data: {
                  rssGuid: item.identity,
                  feedConfigId: config!.id,
                  sourceKind: "RSS",
                  importedSnapshot: snap,
                  ...(!lockMaterial && !overridden.has("audioUrl") && media.audioUrl
                    ? { audioUrl: media.audioUrl }
                    : {}),
                  ...(!lockMaterial && !overridden.has("artworkUrl") && media.artworkUrl
                    ? { artworkUrl: media.artworkUrl }
                    : {}),
                },
              });
              result.linked += 1;
              continue;
            }
            result.skipped += 1;
            continue;
          }

          let slug = slugify(item.title, item.identity);
          const clash = await tx.podcastEpisode.findUnique({ where: { slug } });
          if (clash) slug = `${slug}-${createHash("sha256").update(item.identity).digest("hex").slice(8, 12)}`;

          await tx.podcastEpisode.create({
            data: {
              series,
              title: item.title,
              slug,
              description: item.descriptionPlain || null,
              descriptionHtml: item.descriptionHtml || null,
              publicationDate: item.publicationDate,
              listeningUrl: media.listeningUrl,
              artworkUrl: media.artworkUrl,
              audioUrl: media.audioUrl,
              durationSeconds: item.durationSeconds,
              episodeNumber: item.episodeNumber,
              seasonNumber: item.seasonNumber,
              publicationState: publishNew ? "PUBLISHED" : "DRAFT",
              sourceKind: "RSS",
              feedConfigId: config!.id,
              rssGuid: item.identity,
              importedSnapshot: snap,
              manualOverrides: {},
              createdById: options.adminId,
            },
          });
          result.created += 1;
        } catch (error) {
          result.failed += 1;
          result.failures.push({
            title: item.title,
            reason: error instanceof Error ? error.message : "failed",
          });
        }
      }

      await tx.podcastFeedConfig.update({
        where: { id: config!.id },
        data: {
          feedTitle: feed.title,
          ...(feed.feedIdentity ? { feedIdentity: feed.feedIdentity } : {}),
          lastFetchedAt: new Date(),
          lastFetchStatus: "import_ok",
          lastFetchError: null,
          lastItemCount: feed.items.length,
          updatedById: options.adminId,
        },
      });
    },
    { timeout: 120_000 },
  );

  return result;
}

export async function setEpisodeSpotifyUrl(options: {
  adminId: string;
  episodeId: string;
  spotifyEpisodeUrl: string | null;
}) {
  await requireAdmin(options.adminId);
  const existing = await prisma.podcastEpisode.findUnique({ where: { id: options.episodeId } });
  if (!existing) fail("NOT_FOUND");
  const spotify = options.spotifyEpisodeUrl
    ? sanitizeSpotifyEpisodeUrl(options.spotifyEpisodeUrl)
    : null;
  if (options.spotifyEpisodeUrl?.trim() && !spotify) fail("INVALID_SPOTIFY_URL");
  return prisma.podcastEpisode.update({
    where: { id: existing.id },
    data: {
      spotifyEpisodeUrl: spotify,
      manualOverrides: mergeManualOverrides(existing.manualOverrides, ["spotifyEpisodeUrl"]),
    },
  });
}
