import { prisma } from "@/lib/db";
import { isEitherBlocked } from "@/lib/messaging/blocks";
import { TARGETED_QUESTION_MAX, TARGETED_QUESTIONS_PER_DAY, utcDayKey } from "@/lib/community/constants";
import {
  createNotification,
  markRead,
  unreadCount,
  listNotifications,
} from "@/lib/notifications/service";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

/**
 * Targeted expert question — invitation to respond, not a service promise.
 * Respects blocks and expert acceptTargetedQuestions preference.
 */
export async function sendTargetedExpertQuestion(options: {
  askerId: string;
  expertUserId: string;
  body: string;
  questionId?: string | null;
}) {
  if (options.askerId === options.expertUserId) fail("INVALID_TARGET");
  const body = options.body.trim();
  if (!body || body.length > TARGETED_QUESTION_MAX) fail("INVALID_BODY");

  if (await isEitherBlocked(options.askerId, options.expertUserId)) fail("BLOCKED");

  const expertProfile = await prisma.profile.findUnique({
    where: { userId: options.expertUserId },
    select: { acceptTargetedQuestions: true, displayName: true },
  });
  if (!expertProfile?.acceptTargetedQuestions) fail("NOT_ACCEPTING");

  const dayKey = utcDayKey();
  const used = await prisma.targetedExpertQuestion.count({
    where: {
      askerId: options.askerId,
      createdAt: {
        gte: new Date(`${dayKey}T00:00:00.000Z`),
        lt: new Date(Date.UTC(
          Number(dayKey.slice(0, 4)),
          Number(dayKey.slice(5, 7)) - 1,
          Number(dayKey.slice(8, 10)) + 1,
        )),
      },
    },
  });
  if (used >= TARGETED_QUESTIONS_PER_DAY) fail("RATE_LIMITED");

  if (options.questionId) {
    const q = await prisma.communityQuestion.findUnique({ where: { id: options.questionId } });
    if (!q || q.status !== "PUBLISHED") fail("QUESTION_NOT_AVAILABLE");
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.targetedExpertQuestion.create({
      data: {
        askerId: options.askerId,
        expertUserId: options.expertUserId,
        body,
        questionId: options.questionId || null,
        status: "OPEN",
      },
    });
    await createNotification({
      userId: options.expertUserId,
      kind: "targeted_expert_question",
      title: "Yeni hedefli soru",
      body: "Bir üye size hedefli bir soru gönderdi. Yanıt zorunlu değildir.",
      href: "/hesabim/uzman",
      payload: { targetedQuestionId: row.id },
      dedupeKey: `targeted_expert_question:${row.id}`,
      tx,
    });
    return row;
  });
}

export async function declineTargetedQuestion(options: {
  expertUserId: string;
  targetedId: string;
}) {
  const row = await prisma.targetedExpertQuestion.findUnique({ where: { id: options.targetedId } });
  if (!row || row.expertUserId !== options.expertUserId) fail("NOT_FOUND");
  if (row.status === "DECLINED") return row;
  if (row.status !== "OPEN") fail("INVALID_STATE");

  const updated = await prisma.targetedExpertQuestion.update({
    where: { id: row.id },
    data: { status: "DECLINED" },
  });

  // Asker only — no question body in the notification.
  await createNotification({
    userId: row.askerId,
    kind: "targeted_expert_decline",
    title: "Hedefli soru yanıtlanmayacak",
    body: "Uzman, hedefli sorunuzu yanıtlamayacağını bildirdi.",
    href: "/hesabim/profil",
    payload: { targetedQuestionId: row.id },
    dedupeKey: `targeted_expert_decline:${row.id}`,
  });

  return updated;
}

export async function listTargetedForExpert(expertUserId: string) {
  return prisma.targetedExpertQuestion.findMany({
    where: { expertUserId, status: { in: ["OPEN", "DECLINED", "ANSWERED"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** @deprecated Prefer listNotifications / unreadCount from notifications/service */
export async function listUnreadNotifications(userId: string) {
  const { items } = await listNotifications(userId, { take: 30 });
  return items.filter((n) => n.readAt == null);
}

/** @deprecated Prefer markRead from notifications/service */
export async function markNotificationRead(options: { userId: string; notificationId: string }) {
  return markRead(options);
}

export { unreadCount };
