-- Legal & Privacy Foundation: versioned documents + acceptances (additive)

CREATE TYPE "LegalDocumentType" AS ENUM (
  'TERMS_OF_SERVICE',
  'PRIVACY_NOTICE',
  'CV_AI_PROCESSING_NOTICE',
  'CV_AI_CONSENT',
  'PROFILE_VISIBILITY_NOTICE',
  'HOST_PREP_SHARING_NOTICE',
  'RECORDING_CONSENT',
  'PUBLICATION_APPROVAL',
  'MARKETING_CONSENT',
  'RECORDING_AND_PUBLICATION_NOTICE'
);

CREATE TYPE "LegalAcceptanceType" AS ENUM (
  'TERMS',
  'PRIVACY_NOTICE',
  'CV_AI_PROCESSING',
  'CV_AI_CONSENT',
  'PROFILE_VISIBILITY',
  'HOST_PREP_SHARING',
  'RECORDING',
  'PUBLICATION',
  'MARKETING'
);

CREATE TABLE "legal_document" (
  "id" TEXT NOT NULL,
  "type" "LegalDocumentType" NOT NULL,
  "version" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'tr',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "bodyMarkdown" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  "requiresReacceptance" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_document_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_document_type_version_locale_key" ON "legal_document"("type", "version", "locale");
CREATE INDEX "legal_document_type_locale_effectiveFrom_idx" ON "legal_document"("type", "locale", "effectiveFrom");

CREATE TABLE "legal_acceptance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "LegalAcceptanceType" NOT NULL,
  "documentType" "LegalDocumentType" NOT NULL,
  "documentVersion" TEXT NOT NULL,
  "documentKey" TEXT NOT NULL,
  "scope" TEXT,
  "relatedResourceType" TEXT,
  "relatedResourceId" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawnAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "legal_acceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "legal_acceptance_userId_type_withdrawnAt_idx" ON "legal_acceptance"("userId", "type", "withdrawnAt");
CREATE INDEX "legal_acceptance_userId_documentKey_idx" ON "legal_acceptance"("userId", "documentKey");
CREATE INDEX "legal_acceptance_relatedResourceType_relatedResourceId_idx" ON "legal_acceptance"("relatedResourceType", "relatedResourceId");
CREATE INDEX "legal_acceptance_type_documentVersion_idx" ON "legal_acceptance"("type", "documentVersion");

ALTER TABLE "legal_acceptance" ADD CONSTRAINT "legal_acceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
