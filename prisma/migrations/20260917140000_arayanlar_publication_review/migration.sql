-- Kariyer Portresi publication review link to podcast_episode

ALTER TABLE "arayanlar_application" ADD COLUMN "publicationEpisodeId" TEXT;
ALTER TABLE "arayanlar_application" ADD COLUMN "publicationReviewRequestedAt" TIMESTAMP(3);
ALTER TABLE "arayanlar_application" ADD COLUMN "publicationReviewVersionId" TEXT;
ALTER TABLE "arayanlar_application" ADD COLUMN "publicationChangeRequestNote" TEXT;
ALTER TABLE "arayanlar_application" ADD COLUMN "publicationChangeRequestedAt" TIMESTAMP(3);

CREATE INDEX "arayanlar_application_publicationEpisodeId_idx" ON "arayanlar_application"("publicationEpisodeId");

ALTER TABLE "arayanlar_application"
  ADD CONSTRAINT "arayanlar_application_publicationEpisodeId_fkey"
  FOREIGN KEY ("publicationEpisodeId") REFERENCES "podcast_episode"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
