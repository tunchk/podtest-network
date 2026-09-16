-- Account-level AI usage policy (independent of staffRole)

CREATE TYPE "AiUsagePolicy" AS ENUM ('STANDARD', 'UNLIMITED_INTERNAL');

ALTER TABLE "user" ADD COLUMN "aiUsagePolicy" "AiUsagePolicy" NOT NULL DEFAULT 'STANDARD';
