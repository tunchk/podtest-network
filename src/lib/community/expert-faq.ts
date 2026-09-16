import { prisma } from "@/lib/db";
import { sanitizeExternalUrl } from "@/lib/security/urls";
import { classifyCommunityContent, communityModerationLabel } from "@/lib/community/moderation";
import {
  COMMUNITY_MODERATION_ADAPTER,
  COMMUNITY_MODERATION_POLICY_VERSION,
  EXPERT_FAQ_ANSWER_MAX,
  EXPERT_FAQ_QUESTION_MAX,
} from "@/lib/community/constants";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

export async function updateExpertSettings(options: {
  userId: string;
  expertDiscussionAreas?: string[];
  acceptTargetedQuestions?: boolean;
  consultationUrl?: string | null;
  consultationPaid?: boolean;
  showAppearancesOnProfile?: boolean;
}) {
  let consultationUrl: string | null | undefined = options.consultationUrl;
  if (consultationUrl !== undefined) {
    if (consultationUrl === null || consultationUrl.trim() === "") {
      consultationUrl = null;
    } else {
      const safe = sanitizeExternalUrl(consultationUrl);
      if (!safe) fail("INVALID_URL");
      consultationUrl = safe;
    }
  }

  const areas = options.expertDiscussionAreas
    ?.map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 20);

  return prisma.profile.update({
    where: { userId: options.userId },
    data: {
      ...(areas ? { expertDiscussionAreas: areas } : {}),
      ...(options.acceptTargetedQuestions !== undefined
        ? { acceptTargetedQuestions: options.acceptTargetedQuestions }
        : {}),
      ...(consultationUrl !== undefined ? { consultationUrl } : {}),
      ...(options.consultationPaid !== undefined
        ? { consultationPaid: options.consultationPaid }
        : {}),
      ...(options.showAppearancesOnProfile !== undefined
        ? { showAppearancesOnProfile: options.showAppearancesOnProfile }
        : {}),
    },
  });
}

async function requireAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { staffRole: true },
  });
  if (!user || user.staffRole !== "ADMIN") fail("FORBIDDEN");
}

export async function createExpertFaqDraft(options: {
  expertUserId: string;
  question: string;
  answer: string;
  proposedByAdminId?: string | null;
}) {
  const question = options.question.trim();
  const answer = options.answer.trim();
  if (!question || question.length > EXPERT_FAQ_QUESTION_MAX) fail("INVALID_QUESTION");
  if (!answer || answer.length > EXPERT_FAQ_ANSWER_MAX) fail("INVALID_ANSWER");

  if (options.proposedByAdminId) {
    await requireAdmin(options.proposedByAdminId);
  } else if (options.expertUserId !== options.expertUserId) {
    fail("FORBIDDEN");
  }

  return prisma.$transaction(async (tx) => {
    const faq = await tx.expertFaq.create({
      data: {
        expertUserId: options.expertUserId,
        proposedByAdminId: options.proposedByAdminId || null,
        question,
        answer,
        currentRevision: 1,
        expertApprovedRevision: null,
        status: options.proposedByAdminId ? "PENDING_EXPERT_APPROVAL" : "DRAFT",
      },
    });
    await tx.expertFaqRevision.create({
      data: {
        faqId: faq.id,
        revision: 1,
        question,
        answer,
        createdById: options.proposedByAdminId || options.expertUserId,
      },
    });
    return faq;
  });
}

/**
 * Editing text clears expert approval for that exact prior revision.
 */
export async function editExpertFaq(options: {
  actorId: string;
  faqId: string;
  question: string;
  answer: string;
}) {
  const faq = await prisma.expertFaq.findUnique({ where: { id: options.faqId } });
  if (!faq || faq.status === "REMOVED") fail("NOT_FOUND");

  const isOwner = faq.expertUserId === options.actorId;
  const actor = await prisma.user.findUnique({
    where: { id: options.actorId },
    select: { staffRole: true },
  });
  const isAdmin = actor?.staffRole === "ADMIN";
  if (!isOwner && !isAdmin) fail("FORBIDDEN");

  const question = options.question.trim();
  const answer = options.answer.trim();
  if (!question || question.length > EXPERT_FAQ_QUESTION_MAX) fail("INVALID_QUESTION");
  if (!answer || answer.length > EXPERT_FAQ_ANSWER_MAX) fail("INVALID_ANSWER");

  const nextRev = faq.currentRevision + 1;
  return prisma.$transaction(async (tx) => {
    await tx.expertFaqRevision.create({
      data: {
        faqId: faq.id,
        revision: nextRev,
        question,
        answer,
        createdById: options.actorId,
      },
    });
    return tx.expertFaq.update({
      where: { id: faq.id },
      data: {
        question,
        answer,
        currentRevision: nextRev,
        // Editing invalidates prior expert approval.
        expertApprovedRevision: null,
        expertApprovedAt: null,
        status: isAdmin && !isOwner ? "PENDING_EXPERT_APPROVAL" : "DRAFT",
        publishedAt: null,
        moderationOutcome: null,
        moderationReason: null,
      },
    });
  });
}

/** Expert must approve the exact current revision before moderation/publish. */
export async function expertApproveFaqRevision(options: {
  expertUserId: string;
  faqId: string;
  revision: number;
}) {
  const faq = await prisma.expertFaq.findUnique({ where: { id: options.faqId } });
  if (!faq || faq.expertUserId !== options.expertUserId) fail("NOT_FOUND");
  if (faq.currentRevision !== options.revision) fail("REVISION_MISMATCH");

  const classification = classifyCommunityContent(`${faq.question}\n${faq.answer}`);

  if (classification.outcome === "reject") {
    return prisma.expertFaq.update({
      where: { id: faq.id },
      data: {
        expertApprovedRevision: options.revision,
        expertApprovedAt: new Date(),
        status: "REJECTED",
        moderationOutcome: "reject",
        moderationReason: classification.safeMessage,
        moderationAdapter: COMMUNITY_MODERATION_ADAPTER,
        moderationPolicyVersion: COMMUNITY_MODERATION_POLICY_VERSION,
      },
    });
  }

  if (classification.outcome === "hold" || classification.outcome === "unavailable") {
    await prisma.moderationHold.create({
      data: {
        kind: "EXPERT_FAQ",
        status: "HELD",
        senderId: options.expertUserId,
        payload: { faqId: faq.id, revision: options.revision },
        idempotencyKey: `faq:${faq.id}:r${options.revision}`,
      },
    });
    return prisma.expertFaq.update({
      where: { id: faq.id },
      data: {
        expertApprovedRevision: options.revision,
        expertApprovedAt: new Date(),
        status: "PENDING_MODERATION",
        moderationOutcome: classification.outcome,
        moderationReason: classification.safeMessage,
        moderationAdapter: COMMUNITY_MODERATION_ADAPTER,
        moderationPolicyVersion: COMMUNITY_MODERATION_POLICY_VERSION,
      },
    });
  }

  return prisma.expertFaq.update({
    where: { id: faq.id },
    data: {
      expertApprovedRevision: options.revision,
      expertApprovedAt: new Date(),
      status: "PUBLISHED",
      publishedAt: new Date(),
      moderationOutcome: "clear",
      moderationReason: null,
      moderationAdapter: COMMUNITY_MODERATION_ADAPTER,
      moderationPolicyVersion: COMMUNITY_MODERATION_POLICY_VERSION,
    },
  });
}

export async function publishHeldExpertFaq(options: { faqId: string; revision: number }) {
  const faq = await prisma.expertFaq.findUnique({ where: { id: options.faqId } });
  if (!faq) fail("NOT_FOUND");
  if (faq.expertApprovedRevision !== options.revision) fail("EXPERT_APPROVAL_REQUIRED");
  return prisma.expertFaq.update({
    where: { id: faq.id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      moderationOutcome: "clear",
      moderationReason: null,
    },
  });
}

export async function removeExpertFaq(options: { actorId: string; faqId: string }) {
  const faq = await prisma.expertFaq.findUnique({ where: { id: options.faqId } });
  if (!faq) fail("NOT_FOUND");
  const actor = await prisma.user.findUnique({
    where: { id: options.actorId },
    select: { staffRole: true },
  });
  if (faq.expertUserId !== options.actorId && actor?.staffRole !== "ADMIN") fail("FORBIDDEN");
  return prisma.expertFaq.update({
    where: { id: faq.id },
    data: { status: "REMOVED", removedAt: new Date(), publishedAt: null },
  });
}

export async function listPublishedFaqsForExpert(expertUserId: string) {
  return prisma.expertFaq.findMany({
    where: { expertUserId, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      question: true,
      answer: true,
      publishedAt: true,
      expertApprovedRevision: true,
    },
  });
}

export async function listOwnerFaqs(expertUserId: string) {
  return prisma.expertFaq.findMany({
    where: { expertUserId, status: { not: "REMOVED" } },
    orderBy: { updatedAt: "desc" },
  });
}

export { communityModerationLabel, fail as expertFaqFail };
