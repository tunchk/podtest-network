-- CreateEnum
CREATE TYPE "AiJobKind" AS ENUM ('PROFILE_PREPARE');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditLotSource" AS ENUM ('SPONSORED_PROFILE_PREPARE', 'MONTHLY', 'PURCHASED', 'STAFF_GIFT');

-- CreateEnum
CREATE TYPE "CreditEntryType" AS ENUM ('GRANT', 'RESERVE', 'SETTLE', 'RELEASE');

-- CreateEnum
CREATE TYPE "AutomatedReviewOutcome" AS ENUM ('CLEAR', 'NEEDS_REVIEW', 'LIKELY_VIOLATION', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CvExtractionStatus" AS ENUM ('PENDING', 'OK', 'UNSUPPORTED', 'ENCRYPTED', 'EMPTY_SCANNED', 'MALFORMED', 'ERROR');

-- AlterTable
ALTER TABLE "profile" ADD COLUMN     "draftRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "publication_review" ADD COLUMN     "snapshotHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "submittedDraftRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "cv_document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "extractionStatus" "CvExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "extractionErrorCode" TEXT,
    "extractedTextChars" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_job" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" "AiJobKind" NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "cvDocumentId" TEXT,
    "inputTextRelativePath" TEXT,
    "profileDraftRevision" INTEGER NOT NULL,
    "creditCostSnapshot" INTEGER NOT NULL,
    "reservationEntryId" TEXT,
    "resultJson" JSONB,
    "resultConflict" BOOLEAN NOT NULL DEFAULT false,
    "safeErrorCode" TEXT,
    "safeErrorMessage" TEXT,
    "providerMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_lot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "CreditLotSource" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "originalAmount" INTEGER NOT NULL,
    "remainingAmount" INTEGER NOT NULL,
    "reservedAmount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "provenance" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "type" "CreditEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "jobId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automated_content_review" (
    "id" TEXT NOT NULL,
    "publicationReviewId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "reviewedDraftRevision" INTEGER NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "outcome" "AutomatedReviewOutcome" NOT NULL,
    "reasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summaryForAdmin" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automated_content_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cv_document_userId_createdAt_idx" ON "cv_document"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_job_reservationEntryId_key" ON "ai_job"("reservationEntryId");

-- CreateIndex
CREATE INDEX "ai_job_status_createdAt_idx" ON "ai_job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_job_userId_createdAt_idx" ON "ai_job"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_job_leaseExpiresAt_idx" ON "ai_job"("leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "credit_lot_idempotencyKey_key" ON "credit_lot"("idempotencyKey");

-- CreateIndex
CREATE INDEX "credit_lot_userId_source_idx" ON "credit_lot"("userId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_entry_idempotencyKey_key" ON "credit_ledger_entry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "credit_ledger_entry_userId_createdAt_idx" ON "credit_ledger_entry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_ledger_entry_jobId_idx" ON "credit_ledger_entry"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "automated_content_review_publicationReviewId_key" ON "automated_content_review"("publicationReviewId");

-- CreateIndex
CREATE INDEX "automated_content_review_profileId_createdAt_idx" ON "automated_content_review"("profileId", "createdAt");

-- AddForeignKey
ALTER TABLE "cv_document" ADD CONSTRAINT "cv_document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_cvDocumentId_fkey" FOREIGN KEY ("cvDocumentId") REFERENCES "cv_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_lot" ADD CONSTRAINT "credit_lot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "credit_lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automated_content_review" ADD CONSTRAINT "automated_content_review_publicationReviewId_fkey" FOREIGN KEY ("publicationReviewId") REFERENCES "publication_review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automated_content_review" ADD CONSTRAINT "automated_content_review_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
