import { prisma } from "@/lib/db";
import type { CommunityQuotaKind, Prisma } from "@/generated/prisma/client";
import {
  COMMUNITY_ANSWERS_PER_DAY,
  COMMUNITY_QUESTIONS_PER_DAY,
  utcDayKey,
} from "@/lib/community/constants";

export function dailyAllowance(kind: CommunityQuotaKind) {
  return kind === "QUESTION" ? COMMUNITY_QUESTIONS_PER_DAY : COMMUNITY_ANSWERS_PER_DAY;
}

export async function getCommunityQuotaStatus(userId: string, kind: CommunityQuotaKind) {
  const dayKey = utcDayKey();
  const used = await prisma.communityQuotaUse.count({
    where: { userId, kind, dayKey },
  });
  const allowance = dailyAllowance(kind);
  return { dayKey, used, allowance, remaining: Math.max(0, allowance - used) };
}

/**
 * Concurrency-safe daily quota consume (FOR UPDATE on same user/kind/day rows).
 * Idempotent on (userId, kind, idempotencyKey).
 */
export async function consumeCommunityQuota(options: {
  userId: string;
  kind: CommunityQuotaKind;
  contentId: string;
  idempotencyKey: string;
  tx: Prisma.TransactionClient;
}) {
  const existing = await options.tx.communityQuotaUse.findUnique({
    where: {
      userId_kind_idempotencyKey: {
        userId: options.userId,
        kind: options.kind,
        idempotencyKey: options.idempotencyKey,
      },
    },
  });
  if (existing) return { created: false as const, use: existing };

  const dayKey = utcDayKey();
  // Advisory lock serializes concurrent creates even when no quota rows exist yet.
  await options.tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${`community-quota:${options.userId}:${options.kind}:${dayKey}`})
    )
  `;

  const used = await options.tx.communityQuotaUse.count({
    where: { userId: options.userId, kind: options.kind, dayKey },
  });
  if (used >= dailyAllowance(options.kind)) {
    throw Object.assign(new Error("QUOTA_EXCEEDED"), { code: "QUOTA_EXCEEDED" });
  }

  const use = await options.tx.communityQuotaUse.create({
    data: {
      userId: options.userId,
      kind: options.kind,
      dayKey,
      contentId: options.contentId,
      idempotencyKey: options.idempotencyKey,
    },
  });
  return { created: true as const, use };
}
