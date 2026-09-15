import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { isEitherBlocked } from "@/lib/messaging/blocks";
import { classifyMessagingContent } from "@/lib/messaging/content-moderation";
import {
  DIRECT_MESSAGE_MAX_CHARS,
  MESSAGE_SENDS_PER_MINUTE,
  REMOVED_MESSAGE_PLACEHOLDER,
  orderedPair,
} from "@/lib/messaging/constants";
import { isMessagingTemporarilyRestricted } from "@/lib/messaging/preferences";
import type { Prisma } from "@/generated/prisma/client";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

export async function ensureConversationForPair(options: {
  userA: string;
  userB: string;
  tx: Prisma.TransactionClient;
  activate?: boolean;
}) {
  const ordered = orderedPair(options.userA, options.userB);
  let conversation = await options.tx.conversation.findUnique({
    where: {
      participantLowId_participantHighId: {
        participantLowId: ordered.low,
        participantHighId: ordered.high,
      },
    },
  });

  if (!conversation) {
    conversation = await options.tx.conversation.create({
      data: {
        participantLowId: ordered.low,
        participantHighId: ordered.high,
        messagingState: "ACTIVE",
      },
    });
    await options.tx.conversationParticipant.createMany({
      data: [
        { conversationId: conversation.id, userId: options.userA },
        { conversationId: conversation.id, userId: options.userB },
      ],
    });
  } else {
    const parts = await options.tx.conversationParticipant.findMany({
      where: { conversationId: conversation.id },
    });
    const have = new Set(parts.map((p) => p.userId));
    for (const uid of [options.userA, options.userB]) {
      if (!have.has(uid)) {
        await options.tx.conversationParticipant.create({
          data: { conversationId: conversation.id, userId: uid },
        });
      }
    }
    if (options.activate && conversation.messagingState !== "ACTIVE") {
      conversation = await options.tx.conversation.update({
        where: { id: conversation.id },
        data: { messagingState: "ACTIVE" },
      });
    }
  }

  return conversation;
}

export async function assertConversationMember(conversationId: string, userId: string) {
  const part = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId },
    },
  });
  if (!part) fail("FORBIDDEN");
  return part;
}

export async function listInbox(userId: string) {
  const parts = await prisma.conversationParticipant.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  profile: {
                    select: {
                      published: true,
                      publicationStatus: true,
                      publicSnapshot: true,
                      displayName: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          },
          messages: {
            where: { deliveryStatus: "DELIVERED" },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const items = [];
  for (const part of parts) {
    const other = part.conversation.participants.find((p) => p.userId !== userId);
    if (!other) continue;
    const unread = await countUnread(part.conversationId, userId, part);
    const last = part.conversation.messages[0] ?? null;
    items.push({
      conversationId: part.conversationId,
      messagingState: part.conversation.messagingState,
      lastMessageAt: part.conversation.lastMessageAt,
      unread,
      lastMessage: last
        ? {
            id: last.id,
            createdAt: last.createdAt,
            preview:
              last.deliveryStatus === "REMOVED"
                ? REMOVED_MESSAGE_PLACEHOLDER
                : (last.body ?? "").slice(0, 120),
            senderId: last.senderId,
          }
        : null,
      peer: {
        userId: other.user.id,
        displayName: other.user.profile?.displayName || other.user.name,
        slug:
          other.user.profile?.published && other.user.profile.publicationStatus === "APPROVED"
            ? other.user.profile.slug
            : null,
        publishedProfile:
          Boolean(other.user.profile?.published) &&
          other.user.profile?.publicationStatus === "APPROVED",
      },
    });
  }

  items.sort((a, b) => {
    const at = a.lastMessageAt?.getTime() ?? 0;
    const bt = b.lastMessageAt?.getTime() ?? 0;
    return bt - at;
  });
  return items;
}

async function countUnread(
  conversationId: string,
  userId: string,
  part: { lastReadCreatedAt: Date | null; lastReadMessageId: string | null },
) {
  if (!part.lastReadCreatedAt) {
    return prisma.directMessage.count({
      where: {
        conversationId,
        deliveryStatus: "DELIVERED",
        senderId: { not: userId },
      },
    });
  }

  return prisma.directMessage.count({
    where: {
      conversationId,
      deliveryStatus: "DELIVERED",
      senderId: { not: userId },
      OR: [
        { createdAt: { gt: part.lastReadCreatedAt } },
        {
          createdAt: part.lastReadCreatedAt,
          id: { gt: part.lastReadMessageId ?? "" },
        },
      ],
    },
  });
}

export async function listMessages(options: {
  conversationId: string;
  userId: string;
  cursor?: string | null;
  limit?: number;
}) {
  await assertConversationMember(options.conversationId, options.userId);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);

  let cursorFilter: Prisma.DirectMessageWhereInput = {};
  if (options.cursor) {
    const [createdAtIso, id] = options.cursor.split("|");
    const createdAt = createdAtIso ? new Date(createdAtIso) : null;
    if (createdAt && id) {
      cursorFilter = {
        OR: [
          { createdAt: { lt: createdAt } },
          { createdAt, id: { lt: id } },
        ],
      };
    }
  }

  const rows = await prisma.directMessage.findMany({
    where: {
      conversationId: options.conversationId,
      deliveryStatus: { in: ["DELIVERED", "REMOVED"] },
      ...cursorFilter,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? `${page[page.length - 1]!.createdAt.toISOString()}|${page[page.length - 1]!.id}`
    : null;

  return {
    messages: page.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      createdAt: m.createdAt,
      deliveryStatus: m.deliveryStatus,
      body:
        m.deliveryStatus === "REMOVED"
          ? m.removedPlaceholder ?? REMOVED_MESSAGE_PLACEHOLDER
          : m.body,
    })),
    nextCursor,
  };
}

async function consumeSendRate(userId: string, tx: Prisma.TransactionClient) {
  const minute = new Date();
  minute.setUTCSeconds(0, 0);
  const bucketKey = `send:${minute.toISOString()}`;
  const bucket = await tx.messageRateBucket.upsert({
    where: { userId_bucketKey: { userId, bucketKey } },
    create: { userId, bucketKey, count: 1, updatedAt: new Date() },
    update: { count: { increment: 1 }, updatedAt: new Date() },
  });
  if (bucket.count > MESSAGE_SENDS_PER_MINUTE) {
    fail("RATE_LIMITED");
  }
}

export async function sendMessage(options: {
  conversationId: string;
  senderId: string;
  body: string;
  idempotencyKey: string;
}) {
  const text = options.body.trim();
  if (!text || text.length > DIRECT_MESSAGE_MAX_CHARS) fail("INVALID_BODY");
  if (!options.idempotencyKey.trim()) fail("IDEMPOTENCY_REQUIRED");

  const existing = await prisma.directMessage.findUnique({
    where: {
      senderId_idempotencyKey: {
        senderId: options.senderId,
        idempotencyKey: options.idempotencyKey,
      },
    },
  });
  if (existing) {
    if (existing.conversationId !== options.conversationId || existing.body !== text) {
      fail("IDEMPOTENCY_CONFLICT");
    }
    return { kind: "existing" as const, message: existing };
  }

  if (await isMessagingTemporarilyRestricted(options.senderId)) {
    fail("MESSAGING_RESTRICTED");
  }

  const classification = classifyMessagingContent(text);
  if (classification.outcome === "reject") fail("CONTENT_REJECTED");

  return prisma.$transaction(async (tx) => {
    const part = await tx.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: options.conversationId,
          userId: options.senderId,
        },
      },
    });
    if (!part) fail("FORBIDDEN");

    const conversation = await tx.conversation.findUniqueOrThrow({
      where: { id: options.conversationId },
    });

    const otherId =
      conversation.participantLowId === options.senderId
        ? conversation.participantHighId
        : conversation.participantLowId;

    // Transactional block check first — send cannot race past a completed block.
    if (await isEitherBlocked(options.senderId, otherId, tx)) {
      fail("NOT_AVAILABLE");
    }

    if (conversation.messagingState !== "ACTIVE") fail("MESSAGING_PAUSED");

    await consumeSendRate(options.senderId, tx);

    if (classification.outcome === "hold" || classification.outcome === "unavailable") {
      const hold = await tx.moderationHold.create({
        data: {
          kind: "MESSAGE",
          status: "HELD",
          senderId: options.senderId,
          recipientId: otherId,
          conversationId: options.conversationId,
          idempotencyKey: options.idempotencyKey,
          payload: {
            body: text,
            reasonCode:
              classification.outcome === "hold" ? classification.reasonCode : "unavailable",
          },
        },
      });
      return { kind: "held" as const, holdId: hold.id };
    }

    const raced = await tx.directMessage.findUnique({
      where: {
        senderId_idempotencyKey: {
          senderId: options.senderId,
          idempotencyKey: options.idempotencyKey,
        },
      },
    });
    if (raced) return { kind: "existing" as const, message: raced };

    const message = await tx.directMessage.create({
      data: {
        id: randomUUID().replace(/-/g, "").slice(0, 24),
        conversationId: options.conversationId,
        senderId: options.senderId,
        body: text,
        deliveryStatus: "DELIVERED",
        idempotencyKey: options.idempotencyKey,
      },
    });

    await tx.conversation.update({
      where: { id: options.conversationId },
      data: { lastMessageAt: message.createdAt },
    });

    return { kind: "created" as const, message };
  });
}

/**
 * Monotonic unread watermark — never moves backwards from stale polls.
 */
export async function markConversationRead(options: {
  conversationId: string;
  userId: string;
  messageId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const part = await tx.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: options.conversationId,
          userId: options.userId,
        },
      },
    });
    if (!part) fail("FORBIDDEN");

    const message = await tx.directMessage.findFirst({
      where: {
        id: options.messageId,
        conversationId: options.conversationId,
        deliveryStatus: { in: ["DELIVERED", "REMOVED"] },
      },
    });
    if (!message) fail("NOT_FOUND");

    if (
      part.lastReadCreatedAt &&
      (message.createdAt < part.lastReadCreatedAt ||
        (message.createdAt.getTime() === part.lastReadCreatedAt.getTime() &&
          part.lastReadMessageId &&
          message.id <= part.lastReadMessageId))
    ) {
      return part;
    }

    return tx.conversationParticipant.update({
      where: { id: part.id },
      data: {
        lastReadMessageId: message.id,
        lastReadCreatedAt: message.createdAt,
      },
    });
  });
}

export async function getUnreadTotal(userId: string) {
  const parts = await prisma.conversationParticipant.findMany({ where: { userId } });
  let total = 0;
  for (const part of parts) {
    total += await countUnread(part.conversationId, userId, part);
  }
  return total;
}
