import { prisma } from "@/lib/db";
import type { StaffRole } from "@/generated/prisma/client";
import { REPORT_EXPLANATION_MAX_CHARS, REPORT_RATE_LIMIT_PER_HOUR, REMOVED_MESSAGE_PLACEHOLDER } from "@/lib/messaging/constants";
import { setMessagingRestriction } from "@/lib/messaging/preferences";
import { isEitherBlocked } from "@/lib/messaging/blocks";
import { consumeMessageRequestQuota } from "@/lib/messaging/quota";
import { ensureMessagingPreferences } from "@/lib/messaging/preferences";
import { ensureConversationForPair } from "@/lib/messaging/conversations";
import { pairKeyFor } from "@/lib/messaging/constants";
import type { ReportTargetType } from "@/generated/prisma/client";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

function isModeratorRole(role: StaffRole | string | null | undefined) {
  return role === "ADMIN" || role === "MODERATOR";
}

export async function requireModerator(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { staffRole: true },
  });
  if (!user || !isModeratorRole(user.staffRole)) {
    fail("FORBIDDEN");
  }
  // Host authorization alone must not grant moderation — staffRole check only.
  return user;
}

async function assertCanReportTarget(options: {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
}) {
  if (options.targetType === "PROFILE") {
    const profile = await prisma.profile.findFirst({
      where: {
        OR: [{ id: options.targetId }, { userId: options.targetId }, { slug: options.targetId }],
        published: true,
        publicationStatus: "APPROVED",
      },
    });
    if (!profile) fail("NOT_FOUND");
    return {
      evidenceSnapshot: {
        targetType: "PROFILE",
        profileId: profile.id,
        userId: profile.userId,
        slug: profile.slug,
        displayName: profile.displayName,
        headline: profile.headline,
      },
      canonicalId: profile.id,
    };
  }

  if (options.targetType === "MESSAGE_REQUEST") {
    const request = await prisma.messageRequest.findUnique({
      where: { id: options.targetId },
    });
    if (!request) fail("NOT_FOUND");
    if (request.senderId !== options.reporterId && request.recipientId !== options.reporterId) {
      fail("FORBIDDEN");
    }
    return {
      evidenceSnapshot: {
        targetType: "MESSAGE_REQUEST",
        requestId: request.id,
        status: request.status,
        introductionPreview: request.introduction.slice(0, 200),
        createdAt: request.createdAt.toISOString(),
      },
      canonicalId: request.id,
    };
  }

  if (options.targetType === "MESSAGE") {
    const message = await prisma.directMessage.findUnique({
      where: { id: options.targetId },
    });
    if (!message) fail("NOT_FOUND");
    const member = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: message.conversationId,
          userId: options.reporterId,
        },
      },
    });
    if (!member) fail("FORBIDDEN");
    if (message.deliveryStatus === "HELD") fail("FORBIDDEN");

    return {
      evidenceSnapshot: {
        targetType: "MESSAGE",
        messageId: message.id,
        conversationId: message.conversationId,
        deliveryStatus: message.deliveryStatus,
        bodyPreview: (message.body ?? "").slice(0, 200),
        createdAt: message.createdAt.toISOString(),
      },
      canonicalId: message.id,
    };
  }

  if (options.targetType === "COMMUNITY_QUESTION") {
    const q = await prisma.communityQuestion.findUnique({ where: { id: options.targetId } });
    if (!q || q.status !== "PUBLISHED") fail("NOT_FOUND");
    return {
      evidenceSnapshot: {
        targetType: "COMMUNITY_QUESTION",
        questionId: q.id,
        titlePreview: q.title.slice(0, 160),
        bodyPreview: q.body.slice(0, 200),
        authorId: q.authorId,
        publishedRevision: q.publishedRevision,
      },
      canonicalId: q.id,
    };
  }

  if (options.targetType === "COMMUNITY_ANSWER") {
    const a = await prisma.communityAnswer.findUnique({ where: { id: options.targetId } });
    if (!a || a.status !== "PUBLISHED") fail("NOT_FOUND");
    return {
      evidenceSnapshot: {
        targetType: "COMMUNITY_ANSWER",
        answerId: a.id,
        questionId: a.questionId,
        bodyPreview: a.body.slice(0, 200),
        authorId: a.authorId,
        publishedRevision: a.publishedRevision,
      },
      canonicalId: a.id,
    };
  }

  if (options.targetType === "EXPERT_FAQ") {
    const faq = await prisma.expertFaq.findUnique({ where: { id: options.targetId } });
    if (!faq || faq.status !== "PUBLISHED") fail("NOT_FOUND");
    return {
      evidenceSnapshot: {
        targetType: "EXPERT_FAQ",
        faqId: faq.id,
        questionPreview: faq.question.slice(0, 160),
        answerPreview: faq.answer.slice(0, 200),
        expertUserId: faq.expertUserId,
        expertApprovedRevision: faq.expertApprovedRevision,
      },
      canonicalId: faq.id,
    };
  }

  if (options.targetType === "JOB_LISTING") {
    const job = await prisma.jobListing.findUnique({ where: { id: options.targetId } });
    if (!job || job.status !== "PUBLISHED") fail("NOT_FOUND");
    return {
      evidenceSnapshot: {
        targetType: "JOB_LISTING",
        jobId: job.id,
        slug: job.slug,
        titlePreview: job.title.slice(0, 160),
        workspaceId: job.workspaceId,
      },
      canonicalId: job.id,
    };
  }

  fail("INVALID_TARGET");
}

export async function createContentReport(options: {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reasonCode: string;
  explanation?: string;
}) {
  if (!options.reasonCode.trim()) fail("INVALID_REASON");
  const explanation = options.explanation?.trim() || null;
  if (explanation && explanation.length > REPORT_EXPLANATION_MAX_CHARS) fail("EXPLANATION_TOO_LONG");

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.contentReport.count({
    where: { reporterId: options.reporterId, createdAt: { gte: since } },
  });
  if (recent >= REPORT_RATE_LIMIT_PER_HOUR) fail("RATE_LIMITED");

  const access = await assertCanReportTarget(options);
  const dedupeKey = `${options.targetType}:${access.canonicalId}:${options.reasonCode}`;

  const existing = await prisma.contentReport.findUnique({
    where: {
      reporterId_dedupeKey: { reporterId: options.reporterId, dedupeKey },
    },
  });
  if (existing) return { kind: "existing" as const, report: existing };

  return prisma.$transaction(async (tx) => {
    const report = await tx.contentReport.create({
      data: {
        reporterId: options.reporterId,
        targetType: options.targetType,
        targetId: access.canonicalId,
        reasonCode: options.reasonCode.trim(),
        explanation,
        evidenceSnapshot: access.evidenceSnapshot,
        dedupeKey,
      },
    });
    await tx.moderationCase.create({
      data: { reportId: report.id, status: "OPEN" },
    });
    return { kind: "created" as const, report };
  });
}

export async function listOpenModerationCases(actorId: string) {
  await requireModerator(actorId);
  await prisma.moderationAccessLog.create({
    data: {
      actorId,
      action: "list_cases",
      targetType: "queue",
      targetId: "open",
    },
  });
  return prisma.moderationCase.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    include: {
      report: {
        select: {
          id: true,
          targetType: true,
          targetId: true,
          reasonCode: true,
          explanation: true,
          evidenceSnapshot: true,
          createdAt: true,
          reporterId: true,
        },
      },
    },
  });
}

export async function dismissReport(options: {
  actorId: string;
  caseId: string;
  note?: string;
}) {
  await requireModerator(options.actorId);
  return prisma.$transaction(async (tx) => {
    const modCase = await tx.moderationCase.findUnique({ where: { id: options.caseId } });
    if (!modCase) fail("NOT_FOUND");
    await tx.moderationCase.update({
      where: { id: options.caseId },
      data: { status: "DISMISSED" },
    });
    await tx.contentReport.update({
      where: { id: modCase.reportId },
      data: { status: "DISMISSED" },
    });
    await tx.moderationDecision.create({
      data: {
        caseId: options.caseId,
        actorId: options.actorId,
        action: "dismiss",
        note: options.note ?? null,
      },
    });
    await tx.moderationAccessLog.create({
      data: {
        actorId: options.actorId,
        action: "dismiss",
        targetType: "case",
        targetId: options.caseId,
      },
    });
  });
}

export async function removeReportedContent(options: {
  actorId: string;
  caseId: string;
  note?: string;
}) {
  await requireModerator(options.actorId);
  return prisma.$transaction(async (tx) => {
    const modCase = await tx.moderationCase.findUnique({
      where: { id: options.caseId },
      include: { report: true },
    });
    if (!modCase) fail("NOT_FOUND");

    if (modCase.report.targetType === "MESSAGE") {
      await tx.directMessage.updateMany({
        where: { id: modCase.report.targetId },
        data: {
          deliveryStatus: "REMOVED",
          body: null,
          removedPlaceholder: REMOVED_MESSAGE_PLACEHOLDER,
        },
      });
    } else if (modCase.report.targetType === "MESSAGE_REQUEST") {
      await tx.messageRequest.updateMany({
        where: { id: modCase.report.targetId, status: "PENDING" },
        data: { status: "CANCELLED", resolvedAt: new Date() },
      });
    } else if (modCase.report.targetType === "COMMUNITY_QUESTION") {
      await tx.communityQuestion.updateMany({
        where: { id: modCase.report.targetId },
        data: { status: "REMOVED_BY_MODERATOR", removedAt: new Date() },
      });
    } else if (modCase.report.targetType === "COMMUNITY_ANSWER") {
      await tx.communityAnswer.updateMany({
        where: { id: modCase.report.targetId },
        data: { status: "REMOVED_BY_MODERATOR", removedAt: new Date() },
      });
    } else if (modCase.report.targetType === "EXPERT_FAQ") {
      await tx.expertFaq.updateMany({
        where: { id: modCase.report.targetId },
        data: { status: "REMOVED", removedAt: new Date(), publishedAt: null },
      });
    } else if (modCase.report.targetType === "JOB_LISTING") {
      await tx.jobListing.updateMany({
        where: { id: modCase.report.targetId },
        data: { status: "REMOVED", removedAt: new Date() },
      });
    }

    await tx.moderationCase.update({
      where: { id: options.caseId },
      data: { status: "ACTIONED" },
    });
    await tx.contentReport.update({
      where: { id: modCase.reportId },
      data: { status: "ACTIONED" },
    });
    await tx.moderationDecision.create({
      data: {
        caseId: options.caseId,
        actorId: options.actorId,
        action: "remove_content",
        note: options.note ?? null,
      },
    });
  });
}

export async function temporarilyRestrictMessaging(options: {
  actorId: string;
  caseId: string;
  targetUserId: string;
  hours?: number;
  note?: string;
}) {
  await requireModerator(options.actorId);
  const hours = options.hours ?? 24;
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);
  await setMessagingRestriction({ userId: options.targetUserId, until });
  await prisma.moderationDecision.create({
    data: {
      caseId: options.caseId,
      actorId: options.actorId,
      action: "restrict_messaging",
      note: options.note ?? `until ${until.toISOString()}`,
    },
  });
  await prisma.moderationCase.update({
    where: { id: options.caseId },
    data: { status: "ACTIONED" },
  });
}

/**
 * Release held content after rechecking blocks, membership, prefs and quota.
 */
export async function releaseModerationHold(options: {
  actorId: string;
  holdId: string;
}) {
  await requireModerator(options.actorId);
  const hold = await prisma.moderationHold.findUnique({ where: { id: options.holdId } });
  if (!hold || hold.status !== "HELD") fail("NOT_FOUND");

  const payload = hold.payload as {
    body?: string;
    introduction?: string;
    isResumption?: boolean;
    questionId?: string;
    answerId?: string;
    faqId?: string;
    jobId?: string;
    revision?: number;
    title?: string;
  };

  if (hold.kind === "COMMUNITY_QUESTION") {
    if (!payload.questionId || payload.revision == null) fail("INVALID_HOLD");
    const { publishHeldQuestionRevision } = await import("@/lib/community/questions");
    await publishHeldQuestionRevision({
      questionId: payload.questionId,
      revision: payload.revision,
    });
    await prisma.moderationHold.update({
      where: { id: hold.id },
      data: { status: "RELEASED", resolvedAt: new Date() },
    });
    return { kind: "community_question" as const, questionId: payload.questionId };
  }

  if (hold.kind === "COMMUNITY_ANSWER") {
    if (!payload.answerId || payload.revision == null) fail("INVALID_HOLD");
    const { publishHeldAnswerRevision } = await import("@/lib/community/answers");
    await publishHeldAnswerRevision({
      answerId: payload.answerId,
      revision: payload.revision,
    });
    await prisma.moderationHold.update({
      where: { id: hold.id },
      data: { status: "RELEASED", resolvedAt: new Date() },
    });
    return { kind: "community_answer" as const, answerId: payload.answerId };
  }

  if (hold.kind === "EXPERT_FAQ") {
    if (!payload.faqId || payload.revision == null) fail("INVALID_HOLD");
    const { publishHeldExpertFaq } = await import("@/lib/community/expert-faq");
    await publishHeldExpertFaq({ faqId: payload.faqId, revision: payload.revision });
    await prisma.moderationHold.update({
      where: { id: hold.id },
      data: { status: "RELEASED", resolvedAt: new Date() },
    });
    return { kind: "expert_faq" as const, faqId: payload.faqId };
  }

  if (hold.kind === "JOB_LISTING") {
    if (!payload.jobId || payload.revision == null) fail("INVALID_HOLD");
    const { publishHeldJobRevision } = await import("@/lib/hiring/jobs");
    await publishHeldJobRevision({ jobId: payload.jobId, revision: payload.revision });
    await prisma.moderationHold.update({
      where: { id: hold.id },
      data: { status: "RELEASED", resolvedAt: new Date() },
    });
    return { kind: "job_listing" as const, jobId: payload.jobId };
  }

  if (hold.kind === "MESSAGE") {
    if (!hold.conversationId || !hold.recipientId || !payload.body) fail("INVALID_HOLD");
    if (await isEitherBlocked(hold.senderId, hold.recipientId)) {
      await prisma.moderationHold.update({
        where: { id: hold.id },
        data: { status: "REJECTED", resolvedAt: new Date() },
      });
      fail("NOT_AVAILABLE");
    }
    const conversation = await prisma.conversation.findUnique({
      where: { id: hold.conversationId },
    });
    if (!conversation || conversation.messagingState !== "ACTIVE") {
      await prisma.moderationHold.update({
        where: { id: hold.id },
        data: { status: "REJECTED", resolvedAt: new Date() },
      });
      fail("MESSAGING_PAUSED");
    }
    const member = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: hold.conversationId,
          userId: hold.senderId,
        },
      },
    });
    if (!member) fail("FORBIDDEN");

    const message = await prisma.directMessage.create({
      data: {
        conversationId: hold.conversationId,
        senderId: hold.senderId,
        body: payload.body,
        deliveryStatus: "DELIVERED",
        idempotencyKey: hold.idempotencyKey ?? `hold-release:${hold.id}`,
      },
    });
    await prisma.conversation.update({
      where: { id: hold.conversationId },
      data: { lastMessageAt: message.createdAt },
    });
    await prisma.moderationHold.update({
      where: { id: hold.id },
      data: { status: "RELEASED", resolvedAt: new Date() },
    });
    return { kind: "message" as const, messageId: message.id };
  }

  if (hold.kind !== "MESSAGE_REQUEST") fail("INVALID_HOLD");

  // MESSAGE_REQUEST hold — consume quota only on approval
  if (!hold.recipientId || !payload.introduction) fail("INVALID_HOLD");
  if (await isEitherBlocked(hold.senderId, hold.recipientId)) {
    await prisma.moderationHold.update({
      where: { id: hold.id },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
    fail("NOT_AVAILABLE");
  }
  const prefs = await ensureMessagingPreferences(hold.recipientId);
  if (!prefs.acceptMessageRequests && !payload.isResumption) {
    await prisma.moderationHold.update({
      where: { id: hold.id },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
    fail("REQUESTS_DISABLED");
  }

  return prisma.$transaction(async (tx) => {
    const requestId = hold.id;
    try {
      await consumeMessageRequestQuota({
        userId: hold.senderId,
        idempotencyKey: hold.idempotencyKey ?? `hold:${hold.id}`,
        requestId,
        tx,
      });
    } catch {
      await tx.moderationHold.update({
        where: { id: hold.id },
        data: { status: "REJECTED", resolvedAt: new Date() },
      });
      fail("QUOTA_EXCEEDED");
    }

    let conversationId: string | null = null;
    if (payload.isResumption) {
      const conversation = await ensureConversationForPair({
        userA: hold.senderId,
        userB: hold.recipientId!,
        tx,
        activate: false,
      });
      conversationId = conversation.id;
    }

    const request = await tx.messageRequest.create({
      data: {
        id: requestId,
        senderId: hold.senderId,
        recipientId: hold.recipientId!,
        pairKey: pairKeyFor(hold.senderId, hold.recipientId!),
        status: "PENDING",
        introduction: payload.introduction!,
        idempotencyKey: hold.idempotencyKey ?? `hold:${hold.id}`,
        isResumption: Boolean(payload.isResumption),
        conversationId,
      },
    });
    await tx.moderationHold.update({
      where: { id: hold.id },
      data: { status: "RELEASED", resolvedAt: new Date() },
    });

    const { createNotification } = await import("@/lib/notifications/service");
    await createNotification({
      userId: hold.recipientId!,
      kind: "message_request",
      title: "Yeni mesaj isteği",
      body: "Bir üye sana mesaj isteği gönderdi.",
      href: "/mesajlar",
      payload: { requestId: request.id },
      dedupeKey: `message_request:${request.id}`,
      tx,
    });

    return { kind: "request" as const, requestId: request.id };
  });
}

export async function listHeldItems(actorId: string) {
  await requireModerator(actorId);
  return prisma.moderationHold.findMany({
    where: { status: "HELD" },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}
