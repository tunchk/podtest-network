-- Kariyer Portresi recording schedule fields on arayanlar_application

ALTER TABLE "arayanlar_application" ADD COLUMN "recordingScheduledAt" TIMESTAMP(3);
ALTER TABLE "arayanlar_application" ADD COLUMN "recordingTimezone" TEXT;
ALTER TABLE "arayanlar_application" ADD COLUMN "recordingMeetingUrl" TEXT;
ALTER TABLE "arayanlar_application" ADD COLUMN "recordingSchedulingNote" TEXT;
ALTER TABLE "arayanlar_application" ADD COLUMN "recordingScheduledByUserId" TEXT;
ALTER TABLE "arayanlar_application" ADD COLUMN "recordingScheduleUpdatedAt" TIMESTAMP(3);
ALTER TABLE "arayanlar_application" ADD COLUMN "recordingScheduleVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "arayanlar_application" ADD COLUMN "recordingCompletedAt" TIMESTAMP(3);

CREATE INDEX "arayanlar_application_recordingScheduledAt_idx" ON "arayanlar_application"("recordingScheduledAt");

ALTER TABLE "arayanlar_application"
  ADD CONSTRAINT "arayanlar_application_recordingScheduledByUserId_fkey"
  FOREIGN KEY ("recordingScheduledByUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
