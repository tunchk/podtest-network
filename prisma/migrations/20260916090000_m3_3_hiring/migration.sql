-- Milestone 3.3: employer workspaces, job listings, hiring discovery

ALTER TYPE "ReportTargetType" ADD VALUE 'JOB_LISTING';
ALTER TYPE "ModerationHoldKind" ADD VALUE 'JOB_LISTING';

CREATE TYPE "EmployerWorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "EmployerWorkspaceRole" AS ENUM ('OWNER', 'RECRUITER');
CREATE TYPE "EmployerWorkspaceMemberStatus" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "JobListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'CLOSED', 'REMOVED');
CREATE TYPE "JobRemoteType" AS ENUM ('REMOTE', 'HYBRID', 'ON_SITE', 'UNSPECIFIED');
CREATE TYPE "JobEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');
CREATE TYPE "JobApplicationMethod" AS ENUM ('EXTERNAL_URL', 'MESSAGING');
CREATE TYPE "JobSalaryPeriod" AS ENUM ('HOURLY', 'MONTHLY', 'YEARLY');

CREATE TABLE "employer_workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "status" "EmployerWorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employer_workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employer_workspace_member" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "EmployerWorkspaceRole" NOT NULL,
    "status" "EmployerWorkspaceMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employer_workspace_member_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employer_membership_invitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "role" "EmployerWorkspaceRole" NOT NULL DEFAULT 'RECRUITER',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "consumedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employer_membership_invitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_listing" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibilities" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" TEXT,
    "remoteType" "JobRemoteType" NOT NULL DEFAULT 'UNSPECIFIED',
    "employmentType" "JobEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "salaryPeriod" "JobSalaryPeriod",
    "applicationMethod" "JobApplicationMethod" NOT NULL,
    "applicationUrl" TEXT,
    "contactUserId" TEXT,
    "closingDate" TIMESTAMP(3),
    "status" "JobListingStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedRevision" INTEGER,
    "currentRevision" INTEGER NOT NULL DEFAULT 0,
    "moderationReason" TEXT,
    "moderationPolicyVersion" TEXT,
    "moderationAdapter" TEXT,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_listing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_listing_revision" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "classificationOutcome" TEXT,
    "classificationReason" TEXT,
    "moderationDecision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_listing_revision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hiring_saved_search" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hiring_saved_search_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hiring_candidate_list" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hiring_candidate_list_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hiring_candidate_list_entry" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hiring_candidate_list_entry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hiring_candidate_note" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hiring_candidate_note_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employer_workspace_member_workspaceId_userId_key" ON "employer_workspace_member"("workspaceId", "userId");
CREATE INDEX "employer_workspace_ownerId_idx" ON "employer_workspace"("ownerId");
CREATE INDEX "employer_workspace_status_idx" ON "employer_workspace"("status");
CREATE INDEX "employer_workspace_member_userId_status_idx" ON "employer_workspace_member"("userId", "status");
CREATE UNIQUE INDEX "employer_membership_invitation_tokenHash_key" ON "employer_membership_invitation"("tokenHash");
CREATE INDEX "employer_membership_invitation_workspaceId_createdAt_idx" ON "employer_membership_invitation"("workspaceId", "createdAt");
CREATE UNIQUE INDEX "job_listing_slug_key" ON "job_listing"("slug");
CREATE INDEX "job_listing_workspaceId_status_idx" ON "job_listing"("workspaceId", "status");
CREATE INDEX "job_listing_status_publishedAt_idx" ON "job_listing"("status", "publishedAt");
CREATE UNIQUE INDEX "job_listing_revision_jobId_revision_key" ON "job_listing_revision"("jobId", "revision");
CREATE INDEX "hiring_saved_search_workspaceId_createdAt_idx" ON "hiring_saved_search"("workspaceId", "createdAt");
CREATE INDEX "hiring_candidate_list_workspaceId_createdAt_idx" ON "hiring_candidate_list"("workspaceId", "createdAt");
CREATE UNIQUE INDEX "hiring_candidate_list_entry_listId_subjectUserId_key" ON "hiring_candidate_list_entry"("listId", "subjectUserId");
CREATE INDEX "hiring_candidate_list_entry_subjectUserId_idx" ON "hiring_candidate_list_entry"("subjectUserId");
CREATE INDEX "hiring_candidate_note_workspaceId_subjectUserId_idx" ON "hiring_candidate_note"("workspaceId", "subjectUserId");
CREATE INDEX "hiring_candidate_note_authorId_createdAt_idx" ON "hiring_candidate_note"("authorId", "createdAt");

ALTER TABLE "employer_workspace" ADD CONSTRAINT "employer_workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employer_workspace_member" ADD CONSTRAINT "employer_workspace_member_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "employer_workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employer_workspace_member" ADD CONSTRAINT "employer_workspace_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employer_membership_invitation" ADD CONSTRAINT "employer_membership_invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "employer_workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employer_membership_invitation" ADD CONSTRAINT "employer_membership_invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employer_membership_invitation" ADD CONSTRAINT "employer_membership_invitation_consumedById_fkey" FOREIGN KEY ("consumedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_listing" ADD CONSTRAINT "job_listing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "employer_workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_listing" ADD CONSTRAINT "job_listing_contactUserId_fkey" FOREIGN KEY ("contactUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_listing_revision" ADD CONSTRAINT "job_listing_revision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hiring_saved_search" ADD CONSTRAINT "hiring_saved_search_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "employer_workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hiring_saved_search" ADD CONSTRAINT "hiring_saved_search_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hiring_candidate_list" ADD CONSTRAINT "hiring_candidate_list_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "employer_workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hiring_candidate_list" ADD CONSTRAINT "hiring_candidate_list_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hiring_candidate_list_entry" ADD CONSTRAINT "hiring_candidate_list_entry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "hiring_candidate_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hiring_candidate_note" ADD CONSTRAINT "hiring_candidate_note_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "employer_workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hiring_candidate_note" ADD CONSTRAINT "hiring_candidate_note_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hiring_candidate_note" ADD CONSTRAINT "hiring_candidate_note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
