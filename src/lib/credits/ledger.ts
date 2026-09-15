import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export const PROFILE_PREPARE_CREDIT_COST = Number(
  process.env.PROFILE_PREPARE_CREDIT_COST ?? "1",
);

export const SPONSORED_PROFILE_PREPARE_AMOUNT = Number(
  process.env.SPONSORED_PROFILE_PREPARE_AMOUNT ?? "1",
);

/**
 * Ledger design notes (M2.1 + future):
 * - Lots hold remaining/reserved balances. Ledger entries are append-only.
 * - Sponsored one-time grants: source SPONSORED_PROFILE_PREPARE, expiresAt null.
 * - Future monthly grants: source MONTHLY with expiresAt; consume eligible monthly
 *   lots before purchased lots (ordering in reserveCredits).
 * - Future purchased credits: source PURCHASED, expiresAt null, survive cancellation.
 * - Moderation AI is a platform cost and never draws from member credit lots.
 */

export async function ensureSponsoredProfilePrepareGrant(userId: string) {
  const idempotencyKey = `sponsored:ai.profile.prepare:v1:${userId}`;

  const existing = await prisma.creditLot.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const lot = await tx.creditLot.create({
        data: {
          userId,
          source: "SPONSORED_PROFILE_PREPARE",
          idempotencyKey,
          originalAmount: SPONSORED_PROFILE_PREPARE_AMOUNT,
          remainingAmount: SPONSORED_PROFILE_PREPARE_AMOUNT,
          reservedAmount: 0,
          expiresAt: null,
          provenance: "one-time-sponsored-m2.1",
        },
      });

      await tx.creditLedgerEntry.create({
        data: {
          userId,
          lotId: lot.id,
          type: "GRANT",
          amount: SPONSORED_PROFILE_PREPARE_AMOUNT,
          idempotencyKey: `grant:${idempotencyKey}`,
        },
      });

      return lot;
    });
  } catch (error) {
    // Concurrent create — unique idempotencyKey wins
    const raced = await prisma.creditLot.findUnique({ where: { idempotencyKey } });
    if (raced) return raced;
    throw error;
  }
}

export async function getAvailableCreditBalance(userId: string) {
  await ensureSponsoredProfilePrepareGrant(userId);
  const lots = await prisma.creditLot.findMany({
    where: {
      userId,
      remainingAmount: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  return lots.reduce((sum, lot) => sum + (lot.remainingAmount - lot.reservedAmount), 0);
}

/**
 * Atomically reserve `amount` across lots. Prefer monthly (expiring) then sponsored then purchased.
 */
export async function reserveCreditsForJob(options: {
  userId: string;
  jobId: string;
  amount: number;
  tx?: Prisma.TransactionClient;
}) {
  const run = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.creditLedgerEntry.findUnique({
      where: { idempotencyKey: `reserve:${options.jobId}` },
    });
    if (existing) {
      return existing;
    }

    // Lock eligible lots to prevent concurrent overspend.
    const lots = await tx.$queryRaw<
      Array<{
        id: string;
        remainingAmount: number;
        reservedAmount: number;
      }>
    >`
      SELECT id, "remainingAmount", "reservedAmount"
      FROM credit_lot
      WHERE "userId" = ${options.userId}
        AND "remainingAmount" > 0
        AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
      ORDER BY "expiresAt" ASC NULLS LAST, "createdAt" ASC
      FOR UPDATE
    `;

    let need = options.amount;
    const allocations: { lotId: string; take: number }[] = [];

    for (const lot of lots) {
      const available = lot.remainingAmount - lot.reservedAmount;
      if (available <= 0) continue;
      const take = Math.min(available, need);
      allocations.push({ lotId: lot.id, take });
      need -= take;
      if (need === 0) break;
    }

    if (need > 0 || allocations.length === 0) {
      throw new Error("INSUFFICIENT_CREDITS");
    }

    // M2.1 typically uses a single lot for the cost snapshot.
    for (const allocation of allocations) {
      await tx.creditLot.update({
        where: { id: allocation.lotId },
        data: { reservedAmount: { increment: allocation.take } },
      });
    }

    const primary = allocations[0]!;
    const total = allocations.reduce((sum, a) => sum + a.take, 0);

    return tx.creditLedgerEntry.create({
      data: {
        userId: options.userId,
        lotId: primary.lotId,
        type: "RESERVE",
        amount: total,
        jobId: options.jobId,
        idempotencyKey: `reserve:${options.jobId}`,
      },
    });
  };

  if (options.tx) {
    return run(options.tx);
  }
  return prisma.$transaction((tx) => run(tx));
}

export async function settleJobReservation(jobId: string) {
  const settleKey = `settle:${jobId}`;
  const existing = await prisma.creditLedgerEntry.findUnique({ where: { idempotencyKey: settleKey } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const again = await tx.creditLedgerEntry.findUnique({ where: { idempotencyKey: settleKey } });
    if (again) return again;

    const reserve = await tx.creditLedgerEntry.findUnique({
      where: { idempotencyKey: `reserve:${jobId}` },
    });
    if (!reserve) {
      throw new Error("Missing reservation");
    }

    const released = await tx.creditLedgerEntry.findUnique({
      where: { idempotencyKey: `release:${jobId}` },
    });
    if (released) {
      throw new Error("Already released");
    }

    await tx.creditLot.update({
      where: { id: reserve.lotId },
      data: {
        reservedAmount: { decrement: reserve.amount },
        remainingAmount: { decrement: reserve.amount },
      },
    });

    return tx.creditLedgerEntry.create({
      data: {
        userId: reserve.userId,
        lotId: reserve.lotId,
        type: "SETTLE",
        amount: reserve.amount,
        jobId,
        idempotencyKey: settleKey,
      },
    });
  });
}

export async function releaseJobReservation(jobId: string) {
  const releaseKey = `release:${jobId}`;
  const existing = await prisma.creditLedgerEntry.findUnique({ where: { idempotencyKey: releaseKey } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const again = await tx.creditLedgerEntry.findUnique({ where: { idempotencyKey: releaseKey } });
    if (again) return again;

    const settled = await tx.creditLedgerEntry.findUnique({
      where: { idempotencyKey: `settle:${jobId}` },
    });
    if (settled) {
      return settled;
    }

    const reserve = await tx.creditLedgerEntry.findUnique({
      where: { idempotencyKey: `reserve:${jobId}` },
    });
    if (!reserve) {
      return null;
    }

    await tx.creditLot.update({
      where: { id: reserve.lotId },
      data: { reservedAmount: { decrement: reserve.amount } },
    });

    return tx.creditLedgerEntry.create({
      data: {
        userId: reserve.userId,
        lotId: reserve.lotId,
        type: "RELEASE",
        amount: reserve.amount,
        jobId,
        idempotencyKey: releaseKey,
      },
    });
  });
}

export const ARAYANLAR_PREPARE_CREDIT_COST = Number(
  process.env.ARAYANLAR_PREPARE_CREDIT_COST ?? "1",
);

export const SPONSORED_ARAYANLAR_PREPARE_AMOUNT = Number(
  process.env.SPONSORED_ARAYANLAR_PREPARE_AMOUNT ?? "1",
);

/**
 * One-time sponsored Arayanlar preparation grant (separate from CV/profile grant).
 * Idempotent: sponsored:ai.arayanlar.prepare:v1:{userId}
 */
export async function ensureSponsoredArayanlarPrepareGrant(userId: string) {
  const idempotencyKey = `sponsored:ai.arayanlar.prepare:v1:${userId}`;

  const existing = await prisma.creditLot.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const lot = await tx.creditLot.create({
        data: {
          userId,
          source: "SPONSORED_ARAYANLAR_PREPARE",
          idempotencyKey,
          originalAmount: SPONSORED_ARAYANLAR_PREPARE_AMOUNT,
          remainingAmount: SPONSORED_ARAYANLAR_PREPARE_AMOUNT,
          reservedAmount: 0,
          expiresAt: null,
          provenance: "one-time-sponsored-m2.2-arayanlar",
        },
      });

      await tx.creditLedgerEntry.create({
        data: {
          userId,
          lotId: lot.id,
          type: "GRANT",
          amount: SPONSORED_ARAYANLAR_PREPARE_AMOUNT,
          idempotencyKey: `grant:${idempotencyKey}`,
        },
      });

      return lot;
    });
  } catch (error) {
    const raced = await prisma.creditLot.findUnique({ where: { idempotencyKey } });
    if (raced) return raced;
    throw error;
  }
}

/**
 * Available balance for Arayanlar should include all lots (same wallet),
 * but grant is only issued after cost confirmation / start.
 */
export async function getAvailableCreditBalanceForArayanlar(userId: string) {
  const lots = await prisma.creditLot.findMany({
    where: {
      userId,
      remainingAmount: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  return lots.reduce((sum, lot) => sum + (lot.remainingAmount - lot.reservedAmount), 0);
}
