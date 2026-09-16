/**
 * Authorized local-dev first import + refresh of the PodTest Anchor RSS feed.
 * Does not touch production. No commit/deploy.
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { previewRssFeed, importRssFeed, DEFAULT_PODCAST_RSS_URL } from "../src/lib/podcast/rss-import";

config({ path: ".env.local" });
config({ path: ".env" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  const admin = await db.user.findFirst({ where: { staffRole: "ADMIN" } });
  if (!admin) throw new Error("Need ADMIN user (npm run bootstrap:admin)");

  console.log("Feed URL:", DEFAULT_PODCAST_RSS_URL);
  const preview = await previewRssFeed({
    adminId: admin.id,
    feedUrl: DEFAULT_PODCAST_RSS_URL,
  });
  console.log("Preview:", {
    feedTitle: preview.feedTitle,
    itemCount: preview.itemCount,
    counts: preview.counts,
    truncated: preview.truncated,
    warnings: preview.parseWarnings,
  });

  const first = await importRssFeed({
    adminId: admin.id,
    feedUrl: DEFAULT_PODCAST_RSS_URL,
    publishNew: true,
  });
  console.log("First import:", first);

  const second = await importRssFeed({
    adminId: admin.id,
    feedUrl: DEFAULT_PODCAST_RSS_URL,
    publishNew: true,
  });
  console.log("Second import (refresh):", second);

  const published = await db.podcastEpisode.count({
    where: { publicationState: "PUBLISHED", sourceKind: "RSS" },
  });
  const totalRss = await db.podcastEpisode.count({ where: { sourceKind: "RSS" } });
  console.log("DB RSS episodes:", { published, totalRss });

  if (second.created > 0) {
    throw new Error(`Refresh created duplicates: ${second.created}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
