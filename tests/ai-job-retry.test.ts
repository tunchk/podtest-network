import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDefaultProfileForUser } from "@/lib/profiles/service";
import {
  cancelOwnedJob,
  claimNextJob,
  createProfilePrepareJob,
  processClaimedJob,
  requestJobRetry,
} from "@/lib/ai/jobs";
import {
  ensureSponsoredProfilePrepareGrant,
  getAvailableCreditBalance,
} from "@/lib/credits/ledger";
import { storePasteTextAsCv } from "@/lib/cv/service";
import { jobInputPath } from "@/lib/storage/paths";
import { unlink } from "node:fs/promises";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `retry-${Date.now().toString(36)}`;

async function createUser(label: string) {
  return db.user.create({
    data: {
      name: label,
      email: `${label}-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "MEMBER",
    },
  });
}

async function ledgerSnapshot(userId: string, jobId: string) {
  const entries = await db.creditLedgerEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { type: true, amount: true, jobId: true, idempotencyKey: true },
  });
  const forJob = entries.filter((e) => e.jobId === jobId);
  return {
    all: entries.map((e) => ({ type: e.type, amount: e.amount, key: e.idempotencyKey })),
    job: forJob.map((e) => ({ type: e.type, amount: e.amount, key: e.idempotencyKey })),
    reserveCount: forJob.filter((e) => e.type === "RESERVE").length,
    settleCount: forJob.filter((e) => e.type === "SETTLE").length,
    releaseCount: forJob.filter((e) => e.type === "RELEASE").length,
    available: await getAvailableCreditBalance(userId),
  };
}

describe("AI job retry credit safety", () => {
  let userId = "";
  let otherId = "";
  const ids: string[] = [];

  beforeAll(async () => {
    const user = await createUser("retry-owner");
    const other = await createUser("retry-other");
    userId = user.id;
    otherId = other.id;
    ids.push(userId, otherId);
    await createDefaultProfileForUser(user);
    await createDefaultProfileForUser(other);
    await ensureSponsoredProfilePrepareGrant(userId);
  });

  afterAll(async () => {
    await db.creditLedgerEntry.deleteMany({ where: { userId: { in: ids } } });
    await db.creditLot.deleteMany({ where: { userId: { in: ids } } });
    await db.aiJob.deleteMany({ where: { userId: { in: ids } } });
    await db.cvDocument.deleteMany({ where: { userId: { in: ids } } });
    await db.profile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("retryable failure keeps reservation; retry reuses same job without extra reserve/settle", async () => {
    await db.aiJob.updateMany({
      where: { userId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), finishedAt: new Date() },
    });

    const profileBefore = await db.profile.findUniqueOrThrow({ where: { userId } });
    const publicBefore = profileBefore.publicSnapshot;
    const availableBefore = await getAvailableCreditBalance(userId);

    const cv = await storePasteTextAsCv(
      userId,
      "Ada Retry\nYazılım Kalite Mühendisi\nBeceri: Playwright",
    );
    if (!cv.ok) throw new Error("cv failed");

    const job = await createProfilePrepareJob({ userId, cvDocumentId: cv.documentId });
    const jobId = job.id;
    const afterCreate = await ledgerSnapshot(userId, jobId);
    expect(afterCreate.reserveCount).toBe(1);
    expect(afterCreate.settleCount).toBe(0);
    expect(afterCreate.releaseCount).toBe(0);
    expect(afterCreate.available).toBe(availableBefore - job.creditCostSnapshot);

    // Force retryable failure via missing input (attempt 1 < maxAttempts).
    if (!job.inputTextRelativePath) throw new Error("missing input path");
    await unlink(jobInputPath(job.inputTextRelativePath)).catch(() => undefined);

    const workerId = `retry-worker-${suffix}`;
    let claimed = await claimNextJob(workerId);
    for (let i = 0; i < 5 && claimed && claimed.id !== jobId; i++) {
      await db.aiJob.update({
        where: { id: claimed.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          finishedAt: new Date(),
          leaseOwner: null,
        },
      });
      claimed = await claimNextJob(workerId);
    }
    expect(claimed?.id).toBe(jobId);
    await processClaimedJob(jobId, workerId);

    const failed = await db.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(failed.status).toBe("FAILED");
    expect(failed.attemptCount).toBeGreaterThanOrEqual(1);
    expect(failed.attemptCount).toBeLessThan(failed.maxAttempts);

    const afterFail = await ledgerSnapshot(userId, jobId);
    expect(afterFail.reserveCount).toBe(1);
    expect(afterFail.releaseCount).toBe(0);
    expect(afterFail.settleCount).toBe(0);
    expect(afterFail.available).toBe(availableBefore - job.creditCostSnapshot);

    // Restore input so retry can succeed (same job, synthetic text).
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    const path = jobInputPath(job.inputTextRelativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      "Ada Retry\nYazılım Kalite Mühendisi\nBeceri: Playwright, TypeScript",
      "utf8",
    );

    const retried = await requestJobRetry(jobId, userId);
    expect(retried.id).toBe(jobId);
    expect(retried.status).toBe("QUEUED");

    const afterRetry = await ledgerSnapshot(userId, jobId);
    expect(afterRetry.reserveCount).toBe(1);
    expect(afterRetry.releaseCount).toBe(0);
    expect(afterRetry.settleCount).toBe(0);
    expect(afterRetry.job.map((e) => e.key).filter((k) => k.startsWith("reserve:"))).toEqual([
      `reserve:${jobId}`,
    ]);
    expect(afterRetry.available).toBe(availableBefore - job.creditCostSnapshot);

    // Second retry request while QUEUED must not be allowed / must not duplicate credits.
    await expect(requestJobRetry(jobId, userId)).rejects.toThrow("Not retryable");
    expect((await ledgerSnapshot(userId, jobId)).reserveCount).toBe(1);

    // Cross-user cannot retry.
    await expect(requestJobRetry(jobId, otherId)).rejects.toThrow("Not found");

    claimed = await claimNextJob(workerId);
    for (let i = 0; i < 5 && claimed && claimed.id !== jobId; i++) {
      await db.aiJob.update({
        where: { id: claimed.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          finishedAt: new Date(),
          leaseOwner: null,
        },
      });
      claimed = await claimNextJob(workerId);
    }
    expect(claimed?.id).toBe(jobId);
    await processClaimedJob(jobId, workerId);

    const ready = await db.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(ready.status).toBe("READY");
    expect(ready.id).toBe(jobId);

    const afterReady = await ledgerSnapshot(userId, jobId);
    expect(afterReady.reserveCount).toBe(1);
    expect(afterReady.settleCount).toBe(1);
    expect(afterReady.releaseCount).toBe(0);
    expect(afterReady.available).toBe(availableBefore - job.creditCostSnapshot);

    // Repeat retry after READY must fail without new ledger rows.
    await expect(requestJobRetry(jobId, userId)).rejects.toThrow("Not retryable");
    const afterRepeat = await ledgerSnapshot(userId, jobId);
    expect(afterRepeat.reserveCount).toBe(1);
    expect(afterRepeat.settleCount).toBe(1);
    expect(afterRepeat.all.filter((e) => e.key.includes(jobId)).length).toBe(2);

    const profileAfter = await db.profile.findUniqueOrThrow({ where: { userId } });
    expect(profileAfter.publicSnapshot).toEqual(publicBefore);
  });

  it("idempotent double retry after failure does not add reserve rows", async () => {
    await db.aiJob.updateMany({
      where: { userId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), finishedAt: new Date() },
    });

    await db.creditLot.create({
      data: {
        userId,
        source: "STAFF_GIFT",
        idempotencyKey: `retry-gift-${suffix}`,
        originalAmount: 1,
        remainingAmount: 1,
        reservedAmount: 0,
        provenance: "vitest-retry",
      },
    });

    const cv = await storePasteTextAsCv(userId, "Retry Two\nBeceri: Vitest");
    if (!cv.ok) throw new Error("cv");
    const job = await createProfilePrepareJob({ userId, cvDocumentId: cv.documentId });
    if (!job.inputTextRelativePath) throw new Error("path");
    await unlink(jobInputPath(job.inputTextRelativePath)).catch(() => undefined);

    const workerId = `retry2-${suffix}`;
    let claimed = await claimNextJob(workerId);
    for (let i = 0; i < 5 && claimed && claimed.id !== job.id; i++) {
      await db.aiJob.update({
        where: { id: claimed.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          finishedAt: new Date(),
          leaseOwner: null,
        },
      });
      claimed = await claimNextJob(workerId);
    }
    await processClaimedJob(job.id, workerId);
    const failed = await db.aiJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed.status).toBe("FAILED");

    const first = await requestJobRetry(job.id, userId);
    expect(first.status).toBe("QUEUED");
    const mid = await ledgerSnapshot(userId, job.id);
    expect(mid.reserveCount).toBe(1);

    // Force fail again without settling, then retry again.
    await db.aiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        safeErrorCode: "input_missing",
        safeErrorMessage: "İş girdisi okunamadı.",
        leaseOwner: null,
      },
    });
    // attemptCount still < max; reservation still held (no release).
    const second = await requestJobRetry(job.id, userId);
    expect(second.id).toBe(job.id);
    expect(second.status).toBe("QUEUED");
    const end = await ledgerSnapshot(userId, job.id);
    expect(end.reserveCount).toBe(1);
    expect(end.releaseCount).toBe(0);
    expect(end.settleCount).toBe(0);

    await cancelOwnedJob(job.id, userId);
    const released = await ledgerSnapshot(userId, job.id);
    expect(released.releaseCount).toBe(1);
  });
});
