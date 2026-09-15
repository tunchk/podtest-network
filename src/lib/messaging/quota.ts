import { prisma } from "@/lib/db";
import { CAPABILITY_CATALOG } from "@/lib/capabilities/catalog";
import { evaluateUserCapability } from "@/lib/capabilities/evaluate";
import {
  MESSAGE_REQUEST_EMPLOYER_MONTHLY_ALLOWANCE,
  MESSAGE_REQUEST_FREE_MONTHLY_ALLOWANCE,
  MESSAGE_REQUEST_PLUS_MONTHLY_ALLOWANCE,
  nextUtcMonthStart,
  utcYearMonth,
} from "@/lib/messaging/constants";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Resolve monthly allowance from central catalog hints + env overrides.
 * FREE baseline is a development policy, not a published subscription promise.
 */
export function monthlyAllowanceForPlan(plan: "FREE" | "PLUS" | "EMPLOYER") {
  if (plan === "PLUS") {
    return (
      MESSAGE_REQUEST_PLUS_MONTHLY_ALLOWANCE ||
      CAPABILITY_CATALOG["network.message_request.create"].monthlyQuotaHint ||
      40
    );
  }
  if (plan === "EMPLOYER") {
    return MESSAGE_REQUEST_EMPLOYER_MONTHLY_ALLOWANCE || 50;
  }
  return MESSAGE_REQUEST_FREE_MONTHLY_ALLOWANCE;
}

/** Ordinary members use FREE baseline; paid plans are documented for later billing. */
export async function resolveMessagingPlan(_userId: string): Promise<"FREE" | "PLUS" | "EMPLOYER"> {
  return "FREE";
}

export async function getMessageRequestQuotaStatus(userId: string) {
  const capability = await evaluateUserCapability(userId, "network.message_request.create");
  const plan = await resolveMessagingPlan(userId);
  const allowance = monthlyAllowanceForPlan(plan);
  const yearMonth = utcYearMonth();
  const used = await prisma.messageRequestQuotaUse.count({
    where: { userId, yearMonth },
  });
  const resetAt = nextUtcMonthStart();
  return {
    capabilityAllowed: capability.allowed,
    capabilityReason: capability.reason,
    plan,
    allowance,
    used,
    remaining: Math.max(0, allowance - used),
    yearMonth,
    resetAt,
  };
}

/**
 * Atomically consume one request unit for a successful creation.
 * Idempotent on (userId, idempotencyKey). Returns existing use on retry.
 */
export async function consumeMessageRequestQuota(options: {
  userId: string;
  idempotencyKey: string;
  requestId: string;
  tx: Prisma.TransactionClient;
}) {
  const existing = await options.tx.messageRequestQuotaUse.findUnique({
    where: {
      userId_idempotencyKey: {
        userId: options.userId,
        idempotencyKey: options.idempotencyKey,
      },
    },
  });
  if (existing) return { created: false as const, use: existing };

  const plan = await resolveMessagingPlan(options.userId);
  const allowance = monthlyAllowanceForPlan(plan);
  const yearMonth = utcYearMonth();

  // Lock prior rows for this month to serialize concurrent creates.
  await options.tx.$queryRaw`
    SELECT id FROM message_request_quota_use
    WHERE "userId" = ${options.userId} AND "yearMonth" = ${yearMonth}
    FOR UPDATE
  `;

  const used = await options.tx.messageRequestQuotaUse.count({
    where: { userId: options.userId, yearMonth },
  });
  if (used >= allowance) {
    throw Object.assign(new Error("QUOTA_EXCEEDED"), { code: "QUOTA_EXCEEDED" });
  }

  const use = await options.tx.messageRequestQuotaUse.create({
    data: {
      userId: options.userId,
      yearMonth,
      requestId: options.requestId,
      idempotencyKey: options.idempotencyKey,
    },
  });
  return { created: true as const, use };
}
