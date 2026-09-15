-- Milestone 3.1: member connections and private messaging

CREATE TYPE "MessageRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ConversationMessagingState" AS ENUM ('ACTIVE', 'PAUSED');
CREATE TYPE "DirectMessageDeliveryStatus" AS ENUM ('DELIVERED', 'HELD', 'REJECTED_PRE_DELIVERY', 'REMOVED');
CREATE TYPE "ReportTargetType" AS ENUM ('MESSAGE_REQUEST', 'MESSAGE', 'PROFILE');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');
CREATE TYPE "ModerationCaseStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');
CREATE TYPE "ModerationHoldKind" AS ENUM ('MESSAGE_REQUEST', 'MESSAGE');
CREATE TYPE "ModerationHoldStatus" AS ENUM ('HELD', 'RELEASED', 'REJECTED');

CREATE TABLE "messaging_preferences" (
    "userId" TEXT NOT NULL,
    "acceptMessageRequests" BOOLEAN NOT NULL DEFAULT true,
    "messagingRestrictedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "messaging_preferences_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "participantLowId" TEXT NOT NULL,
    "participantHighId" TEXT NOT NULL,
    "messagingState" "ConversationMessagingState" NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_participantLowId_participantHighId_key" ON "conversation"("participantLowId", "participantHighId");
CREATE INDEX "conversation_lastMessageAt_idx" ON "conversation"("lastMessageAt");

CREATE TABLE "message_request" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "status" "MessageRequestStatus" NOT NULL DEFAULT 'PENDING',
    "introduction" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "isResumption" BOOLEAN NOT NULL DEFAULT false,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "message_request_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_request_senderId_idempotencyKey_key" ON "message_request"("senderId", "idempotencyKey");
CREATE INDEX "message_request_recipientId_status_createdAt_idx" ON "message_request"("recipientId", "status", "createdAt");
CREATE INDEX "message_request_senderId_status_createdAt_idx" ON "message_request"("senderId", "status", "createdAt");
CREATE INDEX "message_request_pairKey_status_idx" ON "message_request"("pairKey", "status");

CREATE TABLE "conversation_participant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadCreatedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_participant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_participant_conversationId_userId_key" ON "conversation_participant"("conversationId", "userId");
CREATE INDEX "conversation_participant_userId_idx" ON "conversation_participant"("userId");

CREATE TABLE "direct_message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT,
    "deliveryStatus" "DirectMessageDeliveryStatus" NOT NULL DEFAULT 'DELIVERED',
    "removedPlaceholder" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "direct_message_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "direct_message_senderId_idempotencyKey_key" ON "direct_message"("senderId", "idempotencyKey");
CREATE INDEX "direct_message_conversationId_createdAt_id_idx" ON "direct_message"("conversationId", "createdAt", "id");

CREATE TABLE "member_block" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_block_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "member_block_blockerId_blockedId_key" ON "member_block"("blockerId", "blockedId");
CREATE INDEX "member_block_blockedId_idx" ON "member_block"("blockedId");

CREATE TABLE "message_request_cooldown" (
    "pairKey" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "message_request_cooldown_pkey" PRIMARY KEY ("pairKey")
);

CREATE TABLE "message_request_quota_use" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "requestId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_request_quota_use_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_request_quota_use_userId_idempotencyKey_key" ON "message_request_quota_use"("userId", "idempotencyKey");
CREATE INDEX "message_request_quota_use_userId_yearMonth_idx" ON "message_request_quota_use"("userId", "yearMonth");

CREATE TABLE "message_rate_bucket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "message_rate_bucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_rate_bucket_userId_bucketKey_key" ON "message_rate_bucket"("userId", "bucketKey");

CREATE TABLE "content_report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "explanation" TEXT,
    "evidenceSnapshot" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_report_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_report_reporterId_dedupeKey_key" ON "content_report"("reporterId", "dedupeKey");
CREATE INDEX "content_report_status_createdAt_idx" ON "content_report"("status", "createdAt");
CREATE INDEX "content_report_targetType_targetId_idx" ON "content_report"("targetType", "targetId");

CREATE TABLE "moderation_case" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "status" "ModerationCaseStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "moderation_case_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "moderation_case_reportId_key" ON "moderation_case"("reportId");
CREATE INDEX "moderation_case_status_createdAt_idx" ON "moderation_case"("status", "createdAt");

CREATE TABLE "moderation_decision" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moderation_decision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "moderation_decision_caseId_createdAt_idx" ON "moderation_decision"("caseId", "createdAt");

CREATE TABLE "moderation_hold" (
    "id" TEXT NOT NULL,
    "kind" "ModerationHoldKind" NOT NULL,
    "status" "ModerationHoldStatus" NOT NULL DEFAULT 'HELD',
    "payload" JSONB NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "conversationId" TEXT,
    "idempotencyKey" TEXT,
    "caseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "moderation_hold_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "moderation_hold_status_createdAt_idx" ON "moderation_hold"("status", "createdAt");
CREATE INDEX "moderation_hold_senderId_status_idx" ON "moderation_hold"("senderId", "status");

CREATE TABLE "moderation_access_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moderation_access_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "moderation_access_log_actorId_createdAt_idx" ON "moderation_access_log"("actorId", "createdAt");

ALTER TABLE "messaging_preferences" ADD CONSTRAINT "messaging_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_request" ADD CONSTRAINT "message_request_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_request" ADD CONSTRAINT "message_request_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_request" ADD CONSTRAINT "message_request_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_block" ADD CONSTRAINT "member_block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_block" ADD CONSTRAINT "member_block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_request_quota_use" ADD CONSTRAINT "message_request_quota_use_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_rate_bucket" ADD CONSTRAINT "message_rate_bucket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "moderation_case" ADD CONSTRAINT "moderation_case_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "content_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "moderation_decision" ADD CONSTRAINT "moderation_decision_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "moderation_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "moderation_decision" ADD CONSTRAINT "moderation_decision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "moderation_hold" ADD CONSTRAINT "moderation_hold_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "moderation_case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "moderation_access_log" ADD CONSTRAINT "moderation_access_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
