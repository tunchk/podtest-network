import { prisma } from "@/lib/db";
import { pairKeyFor } from "@/lib/messaging/constants";
import type { Prisma } from "@/generated/prisma/client";

export async function isEitherBlocked(a: string, b: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? prisma;
  const row = await db.memberBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  return Boolean(row);
}

/**
 * Create a block. Cancels pending requests both ways and pauses conversations.
 * Does not reveal who blocked whom to the other party in API errors.
 */
export async function blockMember(options: { blockerId: string; blockedId: string }) {
  if (options.blockerId === options.blockedId) {
    throw Object.assign(new Error("INVALID"), { code: "INVALID" });
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.memberBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: options.blockerId,
          blockedId: options.blockedId,
        },
      },
    });
    if (existing) return existing;

    const block = await tx.memberBlock.create({
      data: {
        blockerId: options.blockerId,
        blockedId: options.blockedId,
      },
    });

    const pairKey = pairKeyFor(options.blockerId, options.blockedId);
    await tx.messageRequest.updateMany({
      where: { pairKey, status: "PENDING" },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });

    const ordered =
      options.blockerId < options.blockedId
        ? { low: options.blockerId, high: options.blockedId }
        : { low: options.blockedId, high: options.blockerId };

    await tx.conversation.updateMany({
      where: {
        participantLowId: ordered.low,
        participantHighId: ordered.high,
      },
      data: { messagingState: "PAUSED" },
    });

    return block;
  });
}

export async function unblockMember(options: { blockerId: string; blockedId: string }) {
  await prisma.memberBlock.deleteMany({
    where: { blockerId: options.blockerId, blockedId: options.blockedId },
  });
  // Does not restore cancelled requests or auto-reopen messaging.
}

export async function listBlocksForUser(userId: string) {
  return prisma.memberBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      blockedId: true,
      createdAt: true,
      blocked: { select: { id: true, name: true } },
    },
  });
}
