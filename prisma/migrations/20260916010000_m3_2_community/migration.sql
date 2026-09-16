-- Milestone 3.2: community Q&A, speaker invitations, expert FAQs, podcast episodes

-- AlterEnum ReportTargetType
ALTER TYPE "ReportTargetType" ADD VALUE 'COMMUNITY_QUESTION';
ALTER TYPE "ReportTargetType" ADD VALUE 'COMMUNITY_ANSWER';
ALTER TYPE "ReportTargetType" ADD VALUE 'EXPERT_FAQ';

-- AlterEnum ModerationHoldKind
ALTER TYPE "ModerationHoldKind" ADD VALUE 'COMMUNITY_QUESTION';
ALTER TYPE "ModerationHoldKind" ADD VALUE 'COMMUNITY_ANSWER';
ALTER TYPE "ModerationHoldKind" ADD VALUE 'EXPERT_FAQ';

-- Profile expert / speaker fields
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "speakerParticipation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "expertDiscussionAreas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "acceptTargetedQuestions" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "consultationUrl" TEXT;
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "consultationPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "showAppearancesOnProfile" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "CommunityContentStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'REMOVED_BY_OWNER', 'REMOVED_BY_MODERATOR');
CREATE TYPE "CommunityQuotaKind" AS ENUM ('QUESTION', 'ANSWER');
CREATE TYPE "SpeakerInvitationPurpose" AS ENUM ('SPEAKER_STATUS', 'EPISODE_ASSOCIATION');
CREATE TYPE "ExpertFaqStatus" AS ENUM ('DRAFT', 'PENDING_EXPERT_APPROVAL', 'PENDING_MODERATION', 'PUBLISHED', 'REJECTED', 'REMOVED');
CREATE TYPE "PodcastEpisodePublicationState" AS ENUM ('DRAFT', 'PUBLISHED', 'REMOVED');
CREATE TYPE "EpisodeAppearanceStatus" AS ENUM ('PENDING_ADMIN', 'PENDING_MEMBER', 'CONFIRMED', 'REJECTED', 'REVOKED');
CREATE TYPE "EpisodeAppearanceRequester" AS ENUM ('MEMBER', 'ADMIN');
CREATE TYPE "TargetedQuestionStatus" AS ENUM ('OPEN', 'DECLINED', 'ANSWERED', 'HIDDEN');

CREATE TABLE "podcast_episode" (
    "id" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "publicationDate" TIMESTAMP(3),
    "listeningUrl" TEXT,
    "publicationState" "PodcastEpisodePublicationState" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "podcast_episode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_question" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorDisplayName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "topicTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "episodeId" TEXT,
    "status" "CommunityContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedRevision" INTEGER,
    "currentRevision" INTEGER NOT NULL DEFAULT 0,
    "moderationReason" TEXT,
    "moderationPolicyVersion" TEXT,
    "moderationAdapter" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "community_question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_question_revision" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "topicTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "episodeId" TEXT,
    "classificationOutcome" TEXT,
    "classificationReason" TEXT,
    "moderationDecision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_question_revision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_answer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorDisplayName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommunityContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedRevision" INTEGER,
    "currentRevision" INTEGER NOT NULL DEFAULT 0,
    "moderationReason" TEXT,
    "moderationPolicyVersion" TEXT,
    "moderationAdapter" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "community_answer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_answer_revision" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "classificationOutcome" TEXT,
    "classificationReason" TEXT,
    "moderationDecision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_answer_revision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_quota_use" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CommunityQuotaKind" NOT NULL,
    "dayKey" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_quota_use_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_verification_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verification_token_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "speaker_invitation" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "purpose" "SpeakerInvitationPurpose" NOT NULL,
    "episodeId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "consumedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "speaker_invitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expert_faq" (
    "id" TEXT NOT NULL,
    "expertUserId" TEXT NOT NULL,
    "proposedByAdminId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "currentRevision" INTEGER NOT NULL DEFAULT 1,
    "expertApprovedRevision" INTEGER,
    "expertApprovedAt" TIMESTAMP(3),
    "status" "ExpertFaqStatus" NOT NULL DEFAULT 'DRAFT',
    "moderationOutcome" TEXT,
    "moderationReason" TEXT,
    "moderationPolicyVersion" TEXT,
    "moderationAdapter" TEXT,
    "publishedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expert_faq_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expert_faq_revision" (
    "id" TEXT NOT NULL,
    "faqId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expert_faq_revision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "episode_appearance" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "memberUserId" TEXT NOT NULL,
    "status" "EpisodeAppearanceStatus" NOT NULL,
    "requestedBy" "EpisodeAppearanceRequester" NOT NULL,
    "proposedById" TEXT,
    "creditLabel" TEXT,
    "adminVerifiedAt" TIMESTAMP(3),
    "memberAcceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "episode_appearance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "targeted_expert_question" (
    "id" TEXT NOT NULL,
    "askerId" TEXT NOT NULL,
    "expertUserId" TEXT NOT NULL,
    "questionId" TEXT,
    "body" TEXT NOT NULL,
    "status" "TargetedQuestionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "targeted_expert_question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "in_app_notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "in_app_notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "community_question_revision_questionId_revision_key" ON "community_question_revision"("questionId", "revision");
CREATE INDEX "community_question_status_publishedAt_idx" ON "community_question"("status", "publishedAt");
CREATE INDEX "community_question_authorId_createdAt_idx" ON "community_question"("authorId", "createdAt");
CREATE INDEX "community_question_episodeId_idx" ON "community_question"("episodeId");

CREATE UNIQUE INDEX "community_answer_revision_answerId_revision_key" ON "community_answer_revision"("answerId", "revision");
CREATE INDEX "community_answer_questionId_status_publishedAt_idx" ON "community_answer"("questionId", "status", "publishedAt");
CREATE INDEX "community_answer_authorId_createdAt_idx" ON "community_answer"("authorId", "createdAt");

CREATE UNIQUE INDEX "community_quota_use_userId_kind_idempotencyKey_key" ON "community_quota_use"("userId", "kind", "idempotencyKey");
CREATE INDEX "community_quota_use_userId_kind_dayKey_idx" ON "community_quota_use"("userId", "kind", "dayKey");

CREATE UNIQUE INDEX "email_verification_token_tokenHash_key" ON "email_verification_token"("tokenHash");
CREATE INDEX "email_verification_token_userId_createdAt_idx" ON "email_verification_token"("userId", "createdAt");

CREATE UNIQUE INDEX "speaker_invitation_tokenHash_key" ON "speaker_invitation"("tokenHash");
CREATE INDEX "speaker_invitation_createdById_createdAt_idx" ON "speaker_invitation"("createdById", "createdAt");
CREATE INDEX "speaker_invitation_recipientEmail_idx" ON "speaker_invitation"("recipientEmail");

CREATE INDEX "expert_faq_expertUserId_status_idx" ON "expert_faq"("expertUserId", "status");
CREATE INDEX "expert_faq_status_publishedAt_idx" ON "expert_faq"("status", "publishedAt");
CREATE UNIQUE INDEX "expert_faq_revision_faqId_revision_key" ON "expert_faq_revision"("faqId", "revision");

CREATE INDEX "podcast_episode_publicationState_publicationDate_idx" ON "podcast_episode"("publicationState", "publicationDate");
CREATE INDEX "podcast_episode_series_idx" ON "podcast_episode"("series");

CREATE UNIQUE INDEX "episode_appearance_episodeId_memberUserId_key" ON "episode_appearance"("episodeId", "memberUserId");
CREATE INDEX "episode_appearance_memberUserId_status_idx" ON "episode_appearance"("memberUserId", "status");
CREATE INDEX "episode_appearance_status_createdAt_idx" ON "episode_appearance"("status", "createdAt");

CREATE INDEX "targeted_expert_question_expertUserId_status_createdAt_idx" ON "targeted_expert_question"("expertUserId", "status", "createdAt");
CREATE INDEX "targeted_expert_question_askerId_createdAt_idx" ON "targeted_expert_question"("askerId", "createdAt");

CREATE INDEX "in_app_notification_userId_readAt_createdAt_idx" ON "in_app_notification"("userId", "readAt", "createdAt");

ALTER TABLE "podcast_episode" ADD CONSTRAINT "podcast_episode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "community_question" ADD CONSTRAINT "community_question_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_question" ADD CONSTRAINT "community_question_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "podcast_episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "community_question_revision" ADD CONSTRAINT "community_question_revision_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "community_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_answer" ADD CONSTRAINT "community_answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "community_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_answer" ADD CONSTRAINT "community_answer_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_answer_revision" ADD CONSTRAINT "community_answer_revision_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "community_answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_quota_use" ADD CONSTRAINT "community_quota_use_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "speaker_invitation" ADD CONSTRAINT "speaker_invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "speaker_invitation" ADD CONSTRAINT "speaker_invitation_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "podcast_episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "speaker_invitation" ADD CONSTRAINT "speaker_invitation_consumedById_fkey" FOREIGN KEY ("consumedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expert_faq" ADD CONSTRAINT "expert_faq_expertUserId_fkey" FOREIGN KEY ("expertUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expert_faq" ADD CONSTRAINT "expert_faq_proposedByAdminId_fkey" FOREIGN KEY ("proposedByAdminId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expert_faq_revision" ADD CONSTRAINT "expert_faq_revision_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "expert_faq"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "episode_appearance" ADD CONSTRAINT "episode_appearance_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "podcast_episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "episode_appearance" ADD CONSTRAINT "episode_appearance_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "episode_appearance" ADD CONSTRAINT "episode_appearance_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "targeted_expert_question" ADD CONSTRAINT "targeted_expert_question_askerId_fkey" FOREIGN KEY ("askerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "targeted_expert_question" ADD CONSTRAINT "targeted_expert_question_expertUserId_fkey" FOREIGN KEY ("expertUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "targeted_expert_question" ADD CONSTRAINT "targeted_expert_question_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "community_question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_notification" ADD CONSTRAINT "in_app_notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
