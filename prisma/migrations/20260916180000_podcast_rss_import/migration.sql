-- M3.x podcast RSS import: extend episodes + feed config (preserve existing rows)

CREATE TYPE "PodcastEpisodeSourceKind" AS ENUM ('MANUAL', 'RSS');

CREATE TABLE "podcast_feed_config" (
    "id" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "feedIdentity" TEXT,
    "feedTitle" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "lastFetchStatus" TEXT,
    "lastFetchError" TEXT,
    "lastItemCount" INTEGER,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "podcast_feed_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "podcast_feed_config_feedIdentity_key" ON "podcast_feed_config"("feedIdentity");

ALTER TABLE "podcast_feed_config" ADD CONSTRAINT "podcast_feed_config_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "podcast_episode"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "descriptionHtml" TEXT,
  ADD COLUMN "spotifyEpisodeUrl" TEXT,
  ADD COLUMN "artworkUrl" TEXT,
  ADD COLUMN "audioUrl" TEXT,
  ADD COLUMN "durationSeconds" INTEGER,
  ADD COLUMN "episodeNumber" INTEGER,
  ADD COLUMN "seasonNumber" INTEGER,
  ADD COLUMN "sourceKind" "PodcastEpisodeSourceKind" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "feedConfigId" TEXT,
  ADD COLUMN "rssGuid" TEXT,
  ADD COLUMN "importedSnapshot" JSONB,
  ADD COLUMN "manualOverrides" JSONB;

-- Backfill slugs for existing episodes (stable, unique).
UPDATE "podcast_episode"
SET "slug" = lower(regexp_replace(regexp_replace("title", '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
  || '-' || substr("id", 1, 8)
WHERE "slug" IS NULL OR "slug" = '';

-- Ensure uniqueness if empty titles produced empty slug bases.
UPDATE "podcast_episode"
SET "slug" = 'bolum-' || substr("id", 1, 12)
WHERE "slug" IS NULL OR "slug" = '' OR "slug" = '-';

ALTER TABLE "podcast_episode" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "podcast_episode_slug_key" ON "podcast_episode"("slug");
CREATE UNIQUE INDEX "podcast_episode_feedConfigId_rssGuid_key" ON "podcast_episode"("feedConfigId", "rssGuid");
CREATE INDEX "podcast_episode_audioUrl_idx" ON "podcast_episode"("audioUrl");
CREATE INDEX "podcast_episode_listeningUrl_idx" ON "podcast_episode"("listeningUrl");

ALTER TABLE "podcast_episode" ADD CONSTRAINT "podcast_episode_feedConfigId_fkey"
  FOREIGN KEY ("feedConfigId") REFERENCES "podcast_feed_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
