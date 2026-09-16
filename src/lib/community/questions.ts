import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { isEitherBlocked } from "@/lib/messaging/blocks";
import { classifyCommunityContent, communityModerationLabel } from "@/lib/community/moderation";
import { consumeCommunityQuota } from "@/lib/community/quota";
import {
  COMMUNITY_LIST_PAGE_SIZE,
  COMMUNITY_QUESTION_BODY_MAX,
  COMMUNITY_QUESTION_TITLE_MAX,
  COMMUNITY_TOPIC_TAG_LENGTH,
  COMMUNITY_TOPIC_TAG_MAX,
  COMMUNITY_MODERATION_ADAPTER,
  COMMUNITY_MODERATION_POLICY_VERSION,
} from "@/lib/community/constants";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

function normalizeTags(raw: string[] | undefined) {
  if (!raw?.length) return [] as string[];
  const cleaned = raw
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => t.slice(0, COMMUNITY_TOPIC_TAG_LENGTH));
  return [...new Set(cleaned)].slice(0, COMMUNITY_TOPIC_TAG_MAX);
}

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

async function assertPublishedEpisode(episodeId: string | null | undefined, tx?: Prisma.TransactionClient) {
  if (!episodeId) return null;
  const db = tx ?? prisma;
  const episode = await db.podcastEpisode.findUnique({ where: { id: episodeId } });
  if (!episode || episode.publicationState !== "PUBLISHED") fail("EPISODE_NOT_AVAILABLE");
  return episode;
}

export async function createQuestionDraft(options: {
  authorId: string;
  title: string;
  body: string;
  topicTags?: string[];
  episodeId?: string | null;
}) {
  const title = options.title.trim();
  const body = options.body.trim();
  if (!title || title.length > COMMUNITY_QUESTION_TITLE_MAX) fail("INVALID_TITLE");
  if (!body || body.length > COMMUNITY_QUESTION_BODY_MAX) fail("INVALID_BODY");
  await assertPublishedEpisode(options.episodeId);
  const displayName = await authorDisplayName(options.authorId);
  const tags = normalizeTags(options.topicTags);

  return prisma.communityQuestion.create({
    data: {
      authorId: options.authorId,
      authorDisplayName: displayName,
      title,
      body,
      topicTags: tags,
      episodeId: options.episodeId || null,
      status: "DRAFT",
      currentRevision: 0,
    },
  });
}

export async function updateQuestionDraft(options: {
  authorId: string;
  questionId: string;
  title: string;
  body: string;
  topicTags?: string[];
  episodeId?: string | null;
}) {
  const q = await prisma.communityQuestion.findUnique({ where: { id: options.questionId } });
  if (!q || q.authorId !== options.authorId) fail("NOT_FOUND");
  if (q.status !== "DRAFT" && q.status !== "REJECTED") fail("NOT_EDITABLE");
  const title = options.title.trim();
  const body = options.body.trim();
  if (!title || title.length > COMMUNITY_QUESTION_TITLE_MAX) fail("INVALID_TITLE");
  if (!body || body.length > COMMUNITY_QUESTION_BODY_MAX) fail("INVALID_BODY");
  await assertPublishedEpisode(options.episodeId);
  return prisma.communityQuestion.update({
    where: { id: q.id },
    data: {
      title,
      body,
      topicTags: normalizeTags(options.topicTags),
      episodeId: options.episodeId || null,
      status: "DRAFT",
      moderationReason: null,
    },
  });
}

/**
 * Submit draft for publication. Pending edits never replace a previously published revision.
 */
export async function submitQuestion(options: {
  authorId: string;
  questionId: string;
  idempotencyKey: string;
}) {
  const mod = communityModerationLabel();
  return prisma.$transaction(async (tx) => {
    const q = await tx.communityQuestion.findUnique({ where: { id: options.questionId } });
    if (!q || q.authorId !== options.authorId) fail("NOT_FOUND");
    if (q.status === "REMOVED_BY_OWNER" || q.status === "REMOVED_BY_MODERATOR") fail("REMOVED");
    if (q.status === "PENDING_REVIEW") fail("ALREADY_PENDING");

    await assertPublishedEpisode(q.episodeId, tx);

    const isFirstPublish = q.publishedRevision == null && q.status !== "PUBLISHED";
    if (isFirstPublish) {
      await consumeCommunityQuota({
        userId: options.authorId,
        kind: "QUESTION",
        contentId: q.id,
        idempotencyKey: options.idempotencyKey,
        tx,
      });
    }

    const nextRev = q.currentRevision + 1;
    const classification = classifyCommunityContent(`${q.title}\n${q.body}`);

    await tx.communityQuestionRevision.create({
      data: {
        questionId: q.id,
        revision: nextRev,
        title: q.title,
        body: q.body,
        topicTags: q.topicTags,
        episodeId: q.episodeId,
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
      return tx.communityQuestion.update({
        where: { id: q.id },
        data: {
          currentRevision: nextRev,
          status: q.publishedRevision != null ? "PUBLISHED" : "REJECTED",
          moderationReason: classification.safeMessage,
          moderationAdapter: COMMUNITY_MODERATION_ADAPTER,
          moderationPolicyVersion: COMMUNITY_MODERATION_POLICY_VERSION,
        },
      });
    }

    if (classification.outcome === "hold" || classification.outcome === "unavailable") {
      await tx.moderationHold.create({
        data: {
          kind: "COMMUNITY_QUESTION",
          status: "HELD",
          senderId: options.authorId,
          payload: {
            questionId: q.id,
            revision: nextRev,
            title: q.title,
            body: q.body,
          },
          idempotencyKey: `cq:${q.id}:r${nextRev}`,
        },
      });
      return tx.communityQuestion.update({
        where: { id: q.id },
        data: {
          currentRevision: nextRev,
          // Keep prior published revision visible; otherwise pending.
          status: q.publishedRevision != null ? "PUBLISHED" : "PENDING_REVIEW",
          moderationReason: classification.safeMessage,
          moderationAdapter: COMMUNITY_MODERATION_ADAPTER,
          moderationPolicyVersion: COMMUNITY_MODERATION_POLICY_VERSION,
        },
      });
    }

    // clear — publish this revision
    return tx.communityQuestion.update({
      where: { id: q.id },
      data: {
        currentRevision: nextRev,
        publishedRevision: nextRev,
        status: "PUBLISHED",
        publishedAt: q.publishedAt ?? new Date(),
        authorDisplayName: await authorDisplayName(options.authorId),
        moderationReason: null,
        moderationAdapter: COMMUNITY_MODERATION_ADAPTER,
        moderationPolicyVersion: COMMUNITY_MODERATION_POLICY_VERSION,
      },
    });
  });
}

export async function removeQuestionByOwner(options: { authorId: string; questionId: string }) {
  const q = await prisma.communityQuestion.findUnique({ where: { id: options.questionId } });
  if (!q || q.authorId !== options.authorId) fail("NOT_FOUND");
  return prisma.communityQuestion.update({
    where: { id: q.id },
    data: { status: "REMOVED_BY_OWNER", removedAt: new Date() },
  });
}

export async function removeQuestionByModerator(options: { questionId: string }) {
  return prisma.communityQuestion.update({
    where: { id: options.questionId },
    data: { status: "REMOVED_BY_MODERATOR", removedAt: new Date() },
  });
}

export async function publishHeldQuestionRevision(options: {
  questionId: string;
  revision: number;
}) {
  const rev = await prisma.communityQuestionRevision.findUnique({
    where: {
      questionId_revision: { questionId: options.questionId, revision: options.revision },
    },
  });
  if (!rev) fail("NOT_FOUND");
  return prisma.communityQuestion.update({
    where: { id: options.questionId },
    data: {
      title: rev.title,
      body: rev.body,
      topicTags: rev.topicTags,
      episodeId: rev.episodeId,
      publishedRevision: rev.revision,
      status: "PUBLISHED",
      publishedAt: new Date(),
      moderationReason: null,
    },
  });
}

export async function listPublishedQuestions(options: { page?: number; pageSize?: number }) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, options.pageSize ?? COMMUNITY_LIST_PAGE_SIZE);
  const where = { status: "PUBLISHED" as const };
  const [total, items] = await Promise.all([
    prisma.communityQuestion.count({ where }),
    prisma.communityQuestion.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        topicTags: true,
        authorDisplayName: true,
        publishedAt: true,
        episodeId: true,
        episode: {
          select: { id: true, series: true, title: true, publicationState: true },
        },
      },
    }),
  ]);
  return {
    page,
    pageSize,
    total,
    moderation: communityModerationLabel(),
    items: items.map((item) => ({
      ...item,
      episode:
        item.episode?.publicationState === "PUBLISHED"
          ? { id: item.episode.id, series: item.episode.series, title: item.episode.title }
          : null,
    })),
  };
}

export async function getPublicQuestion(questionId: string) {
  const q = await prisma.communityQuestion.findUnique({
    where: { id: questionId },
    include: {
      episode: {
        select: {
          id: true,
          series: true,
          title: true,
          listeningUrl: true,
          publicationState: true,
        },
      },
      answers: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "asc" },
        select: {
          id: true,
          body: true,
          authorDisplayName: true,
          authorId: true,
          publishedAt: true,
        },
      },
    },
  });
  if (!q || q.status !== "PUBLISHED") return null;
  return {
    id: q.id,
    title: q.title,
    body: q.body,
    topicTags: q.topicTags,
    authorDisplayName: q.authorDisplayName,
    authorId: q.authorId,
    publishedAt: q.publishedAt,
    publishedRevision: q.publishedRevision,
    episode:
      q.episode?.publicationState === "PUBLISHED"
        ? {
            id: q.episode.id,
            series: q.episode.series,
            title: q.episode.title,
            listeningUrl: q.episode.listeningUrl,
          }
        : null,
    answers: q.answers,
    moderation: communityModerationLabel(),
  };
}

export async function getOwnerQuestion(options: { authorId: string; questionId: string }) {
  const q = await prisma.communityQuestion.findUnique({ where: { id: options.questionId } });
  if (!q || q.authorId !== options.authorId) return null;
  return q;
}

/** Blocked pairs cannot answer each other's questions. */
export async function assertCanAnswerQuestion(options: {
  answererId: string;
  questionAuthorId: string;
}) {
  if (options.answererId === options.questionAuthorId) return;
  if (await isEitherBlocked(options.answererId, options.questionAuthorId)) {
    fail("BLOCKED");
  }
}

export { fail as communityFail };
