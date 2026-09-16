import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { evaluateUserCapability } from "@/lib/capabilities/evaluate";
import { isEitherBlocked } from "@/lib/messaging/blocks";
import { classifyMessagingContent } from "@/lib/messaging/content-moderation";
import {
  MESSAGE_REQUEST_MAX_CHARS,
  cooldownUntil,
  orderedPair,
  pairKeyFor,
} from "@/lib/messaging/constants";
import {
  ensureMessagingPreferences,
  isMessagingTemporarilyRestricted,
} from "@/lib/messaging/preferences";
import { consumeMessageRequestQuota, getMessageRequestQuotaStatus } from "@/lib/messaging/quota";
import { ensureConversationForPair } from "@/lib/messaging/conversations";
import type { Prisma } from "@/generated/prisma/client";

function fail(code: string, message?: string): never {
  throw Object.assign(new Error(message ?? code), { code });
}

async function assertRecipientDiscoverable(recipientId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId: recipientId } });
  if (
    !profile ||
    !profile.published ||
    profile.publicationStatus !== "APPROVED" ||
    !profile.discoverable
  ) {
    fail("RECIPIENT_NOT_AVAILABLE");
  }
  return profile;
}

export async function createMessageRequest(options: {
  senderId: string;
  recipientId: string;
  introduction: string;
  idempotencyKey: string;
  isResumption?: boolean;
}) {
  if (options.senderId === options.recipientId) fail("SELF_REQUEST");
  const intro = options.introduction.trim();
  if (!intro || intro.length > MESSAGE_REQUEST_MAX_CHARS) fail("INVALID_INTRODUCTION");
  if (!options.idempotencyKey.trim()) fail("IDEMPOTENCY_REQUIRED");

  const existingByKey = await prisma.messageRequest.findUnique({
    where: {
      senderId_idempotencyKey: {
        senderId: options.senderId,
        idempotencyKey: options.idempotencyKey,
      },
    },
  });
  if (existingByKey) {
    if (existingByKey.recipientId !== options.recipientId || existingByKey.introduction !== intro) {
      fail("IDEMPOTENCY_CONFLICT");
    }
    return { kind: "existing" as const, request: existingByKey };
  }

  const capability = await evaluateUserCapability(options.senderId, "network.message_request.create");
  if (!capability.allowed) fail("CAPABILITY_DENIED");

  if (await isMessagingTemporarilyRestricted(options.senderId)) {
    fail("MESSAGING_RESTRICTED");
  }

  if (await isEitherBlocked(options.senderId, options.recipientId)) {
    fail("NOT_AVAILABLE");
  }

  if (!options.isResumption) {
    await assertRecipientDiscoverable(options.recipientId);
  }

  const recipientPrefs = await ensureMessagingPreferences(options.recipientId);
  if (!recipientPrefs.acceptMessageRequests && !options.isResumption) {
    fail("REQUESTS_DISABLED");
  }

  const pairKey = pairKeyFor(options.senderId, options.recipientId);
  const cooldown = await prisma.messageRequestCooldown.findUnique({ where: { pairKey } });
  if (cooldown && cooldown.until.getTime() > Date.now()) {
    fail("COOLDOWN_ACTIVE");
  }

  const ordered = orderedPair(options.senderId, options.recipientId);
  const existingConversation = await prisma.conversation.findUnique({
    where: {
      participantLowId_participantHighId: {
        participantLowId: ordered.low,
        participantHighId: ordered.high,
      },
    },
  });

  if (existingConversation && existingConversation.messagingState === "ACTIVE" && !options.isResumption) {
    return { kind: "open_conversation" as const, conversationId: existingConversation.id };
  }

  if (options.isResumption) {
    if (!existingConversation || existingConversation.messagingState !== "PAUSED") {
      fail("RESUMPTION_NOT_APPLICABLE");
    }
  }

  const pendingEitherWay = await prisma.messageRequest.findFirst({
    where: { pairKey, status: "PENDING" },
  });
  if (pendingEitherWay) {
    if (pendingEitherWay.senderId === options.senderId) {
      fail("PENDING_EXISTS");
    }
    return {
      kind: "opposite_pending" as const,
      incomingRequestId: pendingEitherWay.id,
    };
  }

  const classification = classifyMessagingContent(intro);
  if (classification.outcome === "reject") {
    fail("CONTENT_REJECTED");
  }
  if (classification.outcome === "hold" || classification.outcome === "unavailable") {
    const hold = await prisma.moderationHold.create({
      data: {
        kind: "MESSAGE_REQUEST",
        status: "HELD",
        senderId: options.senderId,
        recipientId: options.recipientId,
        idempotencyKey: options.idempotencyKey,
        payload: {
          introduction: intro,
          isResumption: Boolean(options.isResumption),
          reasonCode:
            classification.outcome === "hold" ? classification.reasonCode : "unavailable",
        },
      },
    });
    return { kind: "held" as const, holdId: hold.id };
  }

  return prisma.$transaction(async (tx) => {
    // Re-check races inside transaction
    if (await isEitherBlocked(options.senderId, options.recipientId, tx)) {
      fail("NOT_AVAILABLE");
    }
    const againPending = await tx.messageRequest.findFirst({
      where: { pairKey, status: "PENDING" },
    });
    if (againPending) {
      if (againPending.senderId === options.senderId) fail("PENDING_EXISTS");
      return {
        kind: "opposite_pending" as const,
        incomingRequestId: againPending.id,
      };
    }

    const racedKey = await tx.messageRequest.findUnique({
      where: {
        senderId_idempotencyKey: {
          senderId: options.senderId,
          idempotencyKey: options.idempotencyKey,
        },
      },
    });
    if (racedKey) return { kind: "existing" as const, request: racedKey };

    const requestId = randomUUID().replace(/-/g, "").slice(0, 24);
    await consumeMessageRequestQuota({
      userId: options.senderId,
      idempotencyKey: options.idempotencyKey,
      requestId,
      tx,
    });

    const request = await tx.messageRequest.create({
      data: {
        id: requestId,
        senderId: options.senderId,
        recipientId: options.recipientId,
        pairKey,
        status: "PENDING",
        introduction: intro,
        idempotencyKey: options.idempotencyKey,
        isResumption: Boolean(options.isResumption),
        conversationId: options.isResumption ? existingConversation?.id : null,
      },
    });

    // Non-sensitive: do not include introduction text.
    const { createNotification } = await import("@/lib/notifications/service");
    await createNotification({
      userId: options.recipientId,
      kind: "message_request",
      title: "Yeni mesaj isteği",
      body: "Bir üye sana mesaj isteği gönderdi.",
      href: "/mesajlar",
      payload: { requestId: request.id },
      dedupeKey: `message_request:${request.id}`,
      tx,
    });

    return { kind: "created" as const, request };
  });
}

export async function acceptMessageRequest(options: {
  recipientId: string;
  requestId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM message_request WHERE id = ${options.requestId} FOR UPDATE
    `;
    if (!rows[0]) fail("NOT_FOUND");

    const request = await tx.messageRequest.findUniqueOrThrow({
      where: { id: options.requestId },
    });
    if (request.recipientId !== options.recipientId) fail("FORBIDDEN");

    if (request.status === "ACCEPTED" && request.conversationId) {
      return { request, conversationId: request.conversationId, already: true };
    }
    if (request.status !== "PENDING") fail("INVALID_STATE");

    if (await isEitherBlocked(request.senderId, request.recipientId, tx)) {
      fail("NOT_AVAILABLE");
    }

    const conversation = await ensureConversationForPair({
      userA: request.senderId,
      userB: request.recipientId,
      tx,
      activate: true,
    });

    const updated = await tx.messageRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: "ACCEPTED",
        resolvedAt: new Date(),
        conversationId: conversation.id,
      },
    });
    if (updated.count === 0) {
      const latest = await tx.messageRequest.findUniqueOrThrow({ where: { id: request.id } });
      if (latest.status === "ACCEPTED" && latest.conversationId) {
        return { request: latest, conversationId: latest.conversationId, already: true };
      }
      fail("INVALID_STATE");
    }

    const accepted = await tx.messageRequest.findUniqueOrThrow({ where: { id: request.id } });
    return { request: accepted, conversationId: conversation.id, already: false };
  });
}

export async function rejectMessageRequest(options: {
  recipientId: string;
  requestId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.messageRequest.findUnique({ where: { id: options.requestId } });
    if (!request) fail("NOT_FOUND");
    if (request.recipientId !== options.recipientId) fail("FORBIDDEN");
    if (request.status === "REJECTED") return request;
    if (request.status !== "PENDING") fail("INVALID_STATE");

    const updated = await tx.messageRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
    if (updated.count === 0) {
      return tx.messageRequest.findUniqueOrThrow({ where: { id: request.id } });
    }

    await tx.messageRequestCooldown.upsert({
      where: { pairKey: request.pairKey },
      create: {
        pairKey: request.pairKey,
        until: cooldownUntil(),
        reason: "REJECTED",
        updatedAt: new Date(),
      },
      update: {
        until: cooldownUntil(),
        reason: "REJECTED",
        updatedAt: new Date(),
      },
    });

    return tx.messageRequest.findUniqueOrThrow({ where: { id: request.id } });
  });
}

export async function cancelMessageRequest(options: {
  senderId: string;
  requestId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.messageRequest.findUnique({ where: { id: options.requestId } });
    if (!request) fail("NOT_FOUND");
    if (request.senderId !== options.senderId) fail("FORBIDDEN");
    if (request.status === "CANCELLED") return request;
    if (request.status !== "PENDING") fail("INVALID_STATE");

    await tx.messageRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });

    await tx.messageRequestCooldown.upsert({
      where: { pairKey: request.pairKey },
      create: {
        pairKey: request.pairKey,
        until: cooldownUntil(),
        reason: "CANCELLED",
        updatedAt: new Date(),
      },
      update: {
        until: cooldownUntil(),
        reason: "CANCELLED",
        updatedAt: new Date(),
      },
    });

    return tx.messageRequest.findUniqueOrThrow({ where: { id: request.id } });
  });
}

export async function listIncomingRequests(userId: string) {
  return prisma.messageRequest.findMany({
    where: { recipientId: userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      sender: {
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
  });
}

export async function listOutgoingRequests(userId: string) {
  return prisma.messageRequest.findMany({
    where: { senderId: userId, status: { in: ["PENDING", "REJECTED", "CANCELLED"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      recipient: {
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
  });
}

/** Public identity for inbox — approved snapshot only, never private draft. */
export function publicIdentityFromUser(user: {
  id: string;
  name: string;
  profile: {
    published: boolean;
    publicationStatus: string;
    publicSnapshot: unknown;
    displayName: string;
    slug: string;
  } | null;
}) {
  const snap =
    user.profile?.published &&
    user.profile.publicationStatus === "APPROVED" &&
    user.profile.publicSnapshot &&
    typeof user.profile.publicSnapshot === "object"
      ? (user.profile.publicSnapshot as Record<string, unknown>)
      : null;

  return {
    userId: user.id,
    displayName: (snap?.displayName as string | undefined) || user.profile?.displayName || user.name,
    slug: snap ? (snap.slug as string | undefined) ?? user.profile?.slug ?? null : null,
    headline: snap ? ((snap.headline as string | null | undefined) ?? null) : null,
    publishedProfile: Boolean(snap),
  };
}

export { getMessageRequestQuotaStatus };
