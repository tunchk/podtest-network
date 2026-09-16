import { prisma } from "@/lib/db";
import { classifyCommunityContent, communityModerationLabel } from "@/lib/community/moderation";
import { consumeCommunityQuota } from "@/lib/community/quota";
import {
  COMMUNITY_ANSWER_BODY_MAX,
  COMMUNITY_MODERATION_ADAPTER,
  COMMUNITY_MODERATION_POLICY_VERSION,
} from "@/lib/community/constants";
import { assertCanAnswerQuestion, communityFail as fail } from "@/lib/community/questions";

async function authorDisplayName(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { displayName: true },
  });
  if (profile?.displayName?.trim()) return profile.displayName.trim();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  return user?.name?.trim() || "Üye";
}

export async function createAnswerDraft(options: {
  authorId: string;
  questionId: string;
  body: string;
}) {
  const body = options.body.trim();
  if (!body || body.length > COMMUNITY_ANSWER_BODY_MAX) fail("INVALID_BODY");

  const question = await prisma.communityQuestion.findUnique({
    where: { id: options.questionId },
  });
  if (!question || question.status !== "PUBLISHED") fail("QUESTION_NOT_AVAILABLE");
  await assertCanAnswerQuestion({
    answererId: options.authorId,
    questionAuthorId: question.authorId,
  });

  const displayName = await authorDisplayName(options.authorId);
  return prisma.communityAnswer.create({
    data: {
      questionId: question.id,
      authorId: options.authorId,
      authorDisplayName: displayName,
      body,
      status: "DRAFT",
      currentRevision: 0,
    },
  });
}

export async function updateAnswerDraft(options: {
  authorId: string;
  answerId: string;
  body: string;
}) {
  const a = await prisma.communityAnswer.findUnique({ where: { id: options.answerId } });
  if (!a || a.authorId !== options.authorId) fail("NOT_FOUND");
  if (a.status !== "DRAFT" && a.status !== "REJECTED") fail("NOT_EDITABLE");
  const body = options.body.trim();
  if (!body || body.length > COMMUNITY_ANSWER_BODY_MAX) fail("INVALID_BODY");
  return prisma.communityAnswer.update({
    where: { id: a.id },
    data: { body, status: "DRAFT", moderationReason: null },
  });
}

export async function submitAnswer(options: {
  authorId: string;
  answerId: string;
  idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.communityAnswer.findUnique({ where: { id: options.answerId } });
    if (!a || a.authorId !== options.authorId) fail("NOT_FOUND");
    if (a.status === "REMOVED_BY_OWNER" || a.status === "REMOVED_BY_MODERATOR") fail("REMOVED");
    if (a.status === "PENDING_REVIEW") fail("ALREADY_PENDING");

    const question = await tx.communityQuestion.findUnique({ where: { id: a.questionId } });
    if (!question || question.status !== "PUBLISHED") fail("QUESTION_NOT_AVAILABLE");

    // Re-check blocks at submit time.
    const { isEitherBlocked } = await import("@/lib/messaging/blocks");
    if (
      options.authorId !== question.authorId &&
      (await isEitherBlocked(options.authorId, question.authorId))
    ) {
      fail("BLOCKED");
    }

    const isFirstPublish = a.publishedRevision == null;
    if (isFirstPublish) {
      await consumeCommunityQuota({
        userId: options.authorId,
        kind: "ANSWER",
        contentId: a.id,
        idempotencyKey: options.idempotencyKey,
        tx,
      });
    }

    const nextRev = a.currentRevision + 1;
    const classification = classifyCommunityContent(a.body);

    await tx.communityAnswerRevision.create({
      data: {
        answerId: a.id,
        revision: nextRev,
        body: a.body,
        classificationOutcome: classification.outcome,
        classificationReason:
          classification.outcome === "reject" || classification.outcome === "hold"
            ? classification.reasonCode
            : classification.outcome === "unavailable"
              ? "unavailable"
              : null,
        moderationDecision:
          classification.outcome === "clear"
            ? "publish"
            : classification.outcome === "reject"
              ? "reject"
              : "hold",
      },
    });

    if (classification.outcome === "reject") {
      return tx.communityAnswer.update({
        where: { id: a.id },
        data: {
          currentRevision: nextRev,
          status: a.publishedRevision != null ? "PUBLISHED" : "REJECTED",
          moderationReason: classification.safeMessage,
          moderationAdapter: COMMUNITY_MODERATION_ADAPTER,
          moderationPolicyVersion: COMMUNITY_MODERATION_POLICY_VERSION,
        },
      });
    }

    if (classification.outcome === "hold" || classification.outcome === "unavailable") {
      await tx.moderationHold.create({
        data: {
          kind: "COMMUNITY_ANSWER",
          status: "HELD",
          senderId: options.authorId,
          payload: { answerId: a.id, revision: nextRev, body: a.body },
          idempotencyKey: `ca:${a.id}:r${nextRev}`,
        },
      });
      return tx.communityAnswer.update({
        where: { id: a.id },
        data: {
          currentRevision: nextRev,
          status: a.publishedRevision != null ? "PUBLISHED" : "PENDING_REVIEW",
          moderationReason: classification.safeMessage,
          moderationAdapter: COMMUNITY_MODERATION_ADAPTER,
          moderationPolicyVersion: COMMUNITY_MODERATION_POLICY_VERSION,
        },
      });
    }

    return tx.communityAnswer.update({
      where: { id: a.id },
      data: {
        currentRevision: nextRev,
        publishedRevision: nextRev,
        status: "PUBLISHED",
        publishedAt: a.publishedAt ?? new Date(),
        authorDisplayName: await authorDisplayName(options.authorId),
        moderationReason: null,
        moderationAdapter: COMMUNITY_MODERATION_ADAPTER,
        moderationPolicyVersion: COMMUNITY_MODERATION_POLICY_VERSION,
      },
    });
  });
}

export async function removeAnswerByOwner(options: { authorId: string; answerId: string }) {
  const a = await prisma.communityAnswer.findUnique({ where: { id: options.answerId } });
  if (!a || a.authorId !== options.authorId) fail("NOT_FOUND");
  return prisma.communityAnswer.update({
    where: { id: a.id },
    data: { status: "REMOVED_BY_OWNER", removedAt: new Date() },
  });
}

export async function removeAnswerByModerator(options: { answerId: string }) {
  return prisma.communityAnswer.update({
    where: { id: options.answerId },
    data: { status: "REMOVED_BY_MODERATOR", removedAt: new Date() },
  });
}

export async function publishHeldAnswerRevision(options: {
  answerId: string;
  revision: number;
}) {
  const rev = await prisma.communityAnswerRevision.findUnique({
    where: { answerId_revision: { answerId: options.answerId, revision: options.revision } },
  });
  if (!rev) fail("NOT_FOUND");
  return prisma.communityAnswer.update({
    where: { id: options.answerId },
    data: {
      body: rev.body,
      publishedRevision: rev.revision,
      status: "PUBLISHED",
      publishedAt: new Date(),
      moderationReason: null,
    },
  });
}

export { communityModerationLabel };
