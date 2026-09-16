import { prisma } from "@/lib/db";
import type { InAppNotification, Prisma } from "@/generated/prisma/client";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateNotificationInput = {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  payload?: Prisma.InputJsonValue;
  dedupeKey: string;
  tx?: Prisma.TransactionClient;
};

export type CreateNotificationResult =
  | { created: true; notification: InAppNotification }
  | { created: false; notification: InAppNotification };

export type DestinationResult =
  | { available: true; href: string }
  | { available: false; reason: string };

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

function client(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? prisma;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

/**
 * Create an in-app notification, skipping when the same userId+dedupeKey already exists.
 * Forward-only: call sites must emit only for newly occurring events.
 */
export async function createNotification(
  options: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  const db = client(options.tx);
  const existing = await db.inAppNotification.findUnique({
    where: {
      userId_dedupeKey: {
        userId: options.userId,
        dedupeKey: options.dedupeKey,
      },
    },
  });
  if (existing) {
    return { created: false, notification: existing };
  }

  try {
    const notification = await db.inAppNotification.create({
      data: {
        userId: options.userId,
        kind: options.kind,
        title: options.title,
        body: options.body ?? null,
        href: options.href ?? null,
        payload: options.payload ?? undefined,
        dedupeKey: options.dedupeKey,
      },
    });
    return { created: true, notification };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await db.inAppNotification.findUnique({
      where: {
        userId_dedupeKey: {
          userId: options.userId,
          dedupeKey: options.dedupeKey,
        },
      },
    });
    if (!raced) throw error;
    return { created: false, notification: raced };
  }
}

export async function listNotifications(
  userId: string,
  options?: { cursor?: string | null; take?: number },
) {
  const take = Math.min(Math.max(options?.take ?? 20, 1), 50);
  const cursor = options?.cursor?.trim() || null;

  if (cursor) {
    const anchor = await prisma.inAppNotification.findFirst({
      where: { id: cursor, userId },
      select: { id: true, createdAt: true },
    });
    if (!anchor) {
      return { items: [] as InAppNotification[], nextCursor: null as string | null };
    }
    const items = await prisma.inAppNotification.findMany({
      where: {
        userId,
        OR: [
          { createdAt: { lt: anchor.createdAt } },
          { createdAt: anchor.createdAt, id: { lt: anchor.id } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
    });
    const page = items.slice(0, take);
    return {
      items: page,
      nextCursor: items.length > take ? page[page.length - 1]?.id ?? null : null,
    };
  }

  const items = await prisma.inAppNotification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });
  const page = items.slice(0, take);
  return {
    items: page,
    nextCursor: items.length > take ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function unreadCount(userId: string) {
  return prisma.inAppNotification.count({
    where: { userId, readAt: null },
  });
}

/** Recipient-only mark one notification read. */
export async function markRead(options: { userId: string; notificationId: string }) {
  const n = await prisma.inAppNotification.findUnique({
    where: { id: options.notificationId },
  });
  if (!n || n.userId !== options.userId) fail("NOT_FOUND");
  if (n.readAt) return n;
  return prisma.inAppNotification.update({
    where: { id: n.id },
    data: { readAt: new Date() },
  });
}

/** Recipient-only mark all unread notifications read. */
export async function markAllRead(userId: string) {
  const result = await prisma.inAppNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

/**
 * Recheck authorization for the stored destination.
 * Never exposes private message / CV / host-pack content — only routing availability.
 */
export async function resolveNotificationDestination(
  notification: Pick<InAppNotification, "id" | "userId" | "kind" | "href" | "payload">,
  viewerUserId: string,
): Promise<DestinationResult> {
  if (notification.userId !== viewerUserId) {
    return { available: false, reason: "Bu bildirime erişim yetkin yok." };
  }

  const payload = payloadRecord(notification.payload);
  const fallbackHref = notification.href?.trim() || null;

  switch (notification.kind) {
    case "message_request": {
      const requestId = typeof payload.requestId === "string" ? payload.requestId : null;
      if (requestId) {
        const request = await prisma.messageRequest.findUnique({
          where: { id: requestId },
          select: { recipientId: true, status: true },
        });
        if (!request || request.recipientId !== viewerUserId) {
          return {
            available: false,
            reason: "Bu mesaj isteği artık senin için geçerli değil.",
          };
        }
      }
      return { available: true, href: fallbackHref ?? "/mesajlar" };
    }
    case "targeted_expert_question": {
      const targetedId =
        typeof payload.targetedQuestionId === "string" ? payload.targetedQuestionId : null;
      if (targetedId) {
        const row = await prisma.targetedExpertQuestion.findUnique({
          where: { id: targetedId },
          select: { expertUserId: true },
        });
        if (!row || row.expertUserId !== viewerUserId) {
          return {
            available: false,
            reason: "Bu hedefli soru artık senin için geçerli değil.",
          };
        }
      }
      return { available: true, href: fallbackHref ?? "/hesabim/uzman" };
    }
    case "targeted_expert_decline":
    case "targeted_expert_answer": {
      const targetedId =
        typeof payload.targetedQuestionId === "string" ? payload.targetedQuestionId : null;
      if (targetedId) {
        const row = await prisma.targetedExpertQuestion.findUnique({
          where: { id: targetedId },
          select: { askerId: true },
        });
        if (!row || row.askerId !== viewerUserId) {
          return {
            available: false,
            reason: "Bu hedefli soru yanıtı artık senin için geçerli değil.",
          };
        }
      }
      return { available: true, href: fallbackHref ?? "/hesabim/profil" };
    }
    case "profile_review_approved":
    case "profile_review_rejected": {
      const profile = await prisma.profile.findUnique({
        where: { userId: viewerUserId },
        select: { id: true },
      });
      if (!profile) {
        return { available: false, reason: "Profil bulunamadı." };
      }
      return { available: true, href: fallbackHref ?? "/hesabim/profil" };
    }
    case "community_answer_published": {
      const questionId = typeof payload.questionId === "string" ? payload.questionId : null;
      const answerId = typeof payload.answerId === "string" ? payload.answerId : null;
      if (!questionId) {
        return { available: false, reason: "Yanıt bildirimine ait soru bulunamadı." };
      }
      const question = await prisma.communityQuestion.findUnique({
        where: { id: questionId },
        select: { authorId: true, status: true },
      });
      if (!question || question.authorId !== viewerUserId || question.status !== "PUBLISHED") {
        return {
          available: false,
          reason: "Bu soru artık senin için görüntülenemiyor.",
        };
      }
      if (answerId) {
        const answer = await prisma.communityAnswer.findUnique({
          where: { id: answerId },
          select: { status: true, questionId: true },
        });
        if (!answer || answer.questionId !== questionId || answer.status !== "PUBLISHED") {
          return {
            available: false,
            reason: "Bu yanıt artık yayımlı değil.",
          };
        }
      }
      return { available: true, href: fallbackHref ?? `/topluluk/sorular/${questionId}` };
    }
    case "arayanlar_prep_ready": {
      const app = await prisma.arayanlarApplication.findUnique({
        where: { userId: viewerUserId },
        select: { prepStatus: true, status: true },
      });
      if (!app || app.status === "WITHDRAWN" || app.prepStatus !== "READY") {
        return {
          available: false,
          reason: "Kayıt öncesi notların şu an görüntülenemiyor.",
        };
      }
      return { available: true, href: fallbackHref ?? "/arayanlar/hazirligim" };
    }
    case "arayanlar_application_submitted":
    case "arayanlar_prep_failed_retryable": {
      const app = await prisma.arayanlarApplication.findUnique({
        where: { userId: viewerUserId },
        select: { status: true },
      });
      if (!app || app.status === "WITHDRAWN") {
        return {
          available: false,
          reason: "Bu başvuru bildirimi artık geçerli değil.",
        };
      }
      return { available: true, href: fallbackHref ?? "/arayanlar/basvurum" };
    }
    case "arayanlar_application_withdrawn": {
      return { available: true, href: fallbackHref ?? "/arayanlar" };
    }
    case "job_listing_published":
    case "job_listing_rejected":
    case "job_listing_held": {
      const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : null;
      if (!workspaceId) {
        return {
          available: false,
          reason: "İş ilanı bildirimine ait çalışma alanı bulunamadı.",
        };
      }
      const member = await prisma.employerWorkspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId, userId: viewerUserId },
        },
        select: { status: true, workspace: { select: { status: true } } },
      });
      if (!member || member.status !== "ACTIVE" || member.workspace.status !== "ACTIVE") {
        return {
          available: false,
          reason: "Bu iş ilanı bildirimine artık erişimin yok.",
        };
      }
      return { available: true, href: fallbackHref ?? "/isveren/ilanlar" };
    }
    case "speaker_invitation_accepted": {
      const user = await prisma.user.findUnique({
        where: { id: viewerUserId },
        select: { staffRole: true },
      });
      if (user?.staffRole !== "ADMIN") {
        return {
          available: false,
          reason: "Bu davet bildirimine yalnızca yöneticiler erişebilir.",
        };
      }
      return { available: true, href: fallbackHref ?? "/yonetim" };
    }
    case "employer_invitation_accepted": {
      const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : null;
      if (!workspaceId) {
        return {
          available: false,
          reason: "Davet bildirimine ait çalışma alanı bulunamadı.",
        };
      }
      const member = await prisma.employerWorkspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId, userId: viewerUserId },
        },
        select: { status: true },
      });
      if (!member || member.status !== "ACTIVE") {
        return {
          available: false,
          reason: "Bu işveren daveti bildirimine artık erişimin yok.",
        };
      }
      return { available: true, href: fallbackHref ?? "/isveren" };
    }
    case "appearance_accepted":
    case "appearance_rejected": {
      return { available: true, href: fallbackHref ?? "/bolumler" };
    }
    default: {
      if (fallbackHref) return { available: true, href: fallbackHref };
      return {
        available: false,
        reason: "Bu bildirimin hedefi artık kullanılamıyor.",
      };
    }
  }
}

/** Notify all active workspace members (publish access = any active member). */
export async function notifyWorkspaceMembers(options: {
  workspaceId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  dedupeKeyPrefix: string;
  payload?: Prisma.InputJsonValue;
}) {
  const members = await prisma.employerWorkspaceMember.findMany({
    where: { workspaceId: options.workspaceId, status: "ACTIVE" },
    select: { userId: true },
  });
  const results = [];
  for (const member of members) {
    results.push(
      await createNotification({
        userId: member.userId,
        kind: options.kind,
        title: options.title,
        body: options.body,
        href: options.href ?? "/isveren/ilanlar",
        dedupeKey: `${options.dedupeKeyPrefix}:user:${member.userId}`,
        payload: options.payload,
      }),
    );
  }
  return results;
}
