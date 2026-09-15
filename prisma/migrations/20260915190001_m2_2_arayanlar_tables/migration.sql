-- Milestone 2.2 part B: tables and nullable AiJob.profileId

ALTER TABLE "ai_job" ALTER COLUMN "profileId" DROP NOT NULL;
ALTER TABLE "ai_job" ALTER COLUMN "profileDraftRevision" SET DEFAULT 0;
ALTER TABLE "ai_job" ADD COLUMN "arayanlarApplicationId" TEXT;

CREATE TABLE "host_authorization" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "host_authorization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "host_authorization_userId_key" ON "host_authorization"("userId");

CREATE TABLE "arayanlar_application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ArayanlarApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "prepStatus" "ArayanlarPrepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "draftAnswers" JSONB NOT NULL DEFAULT '{}',
    "conversationTurns" JSONB NOT NULL DEFAULT '[]',
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,
    "useSummaryFallback" BOOLEAN NOT NULL DEFAULT false,
    "submittedFacts" JSONB,
    "submittedRevision" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "confirmedCostAt" TIMESTAMP(3),
    "editorialTemplateVersion" TEXT NOT NULL DEFAULT 'arayanlar-18m-v1',
    "withdrawnAt" TIMESTAMP(3),
    "assignedHostUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedByUserId" TEXT,
    "prepareJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "arayanlar_application_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "arayanlar_application_userId_key" ON "arayanlar_application"("userId");
CREATE INDEX "arayanlar_application_status_createdAt_idx" ON "arayanlar_application"("status", "createdAt");
CREATE INDEX "arayanlar_application_assignedHostUserId_idx" ON "arayanlar_application"("assignedHostUserId");

CREATE TABLE "arayanlar_artifact" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" "ArayanlarArtifactKind" NOT NULL,
    "submittedRevision" INTEGER NOT NULL,
    "editorialTemplateVersion" TEXT NOT NULL,
    "generatedJson" JSONB NOT NULL,
    "hostEditedJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "arayanlar_artifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "arayanlar_artifact_applicationId_kind_submittedRevision_key" ON "arayanlar_artifact"("applicationId", "kind", "submittedRevision");
CREATE INDEX "arayanlar_artifact_applicationId_kind_idx" ON "arayanlar_artifact"("applicationId", "kind");

ALTER TABLE "host_authorization" ADD CONSTRAINT "host_authorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "host_authorization" ADD CONSTRAINT "host_authorization_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "arayanlar_application" ADD CONSTRAINT "arayanlar_application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "arayanlar_application" ADD CONSTRAINT "arayanlar_application_assignedHostUserId_fkey" FOREIGN KEY ("assignedHostUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "arayanlar_artifact" ADD CONSTRAINT "arayanlar_artifact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "arayanlar_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_arayanlarApplicationId_fkey" FOREIGN KEY ("arayanlarApplicationId") REFERENCES "arayanlar_application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ai_job_arayanlarApplicationId_idx" ON "ai_job"("arayanlarApplicationId");
