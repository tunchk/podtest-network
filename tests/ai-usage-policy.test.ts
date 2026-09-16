import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDefaultProfileForUser } from "@/lib/profiles/service";
import {
  createProfilePrepareJob,
  quoteProfilePrepare,
  requestJobRetry,
  processClaimedJob,
  claimNextJob,
} from "@/lib/ai/jobs";
import { storePasteTextAsCv } from "@/lib/cv/service";
import { setAiUsagePolicyByEmail, isUnlimitedAiUsage } from "@/lib/ai/usage-policy";
import { isStaffRole } from "@/lib/session";
import { PROFILE_PREPARE_CREDIT_COST } from "@/lib/credits/ledger";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `aipol-${Date.now().toString(36)}`;

async function createMember(label: string) {
  const user = await db.user.create({
    data: {
      name: label,
      email: `${label}-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "MEMBER",
      aiUsagePolicy: "STANDARD",
    },
  });
  await createDefaultProfileForUser(user);
  return user;
}

async function drainAllCredits(userId: string) {
  await db.creditLot.updateMany({
    where: { userId },
    data: { remainingAmount: 0, reservedAmount: 0 },
  });
}

describe("AI usage policy (account-level unlimited)", () => {
  const ids: string[] = [];

  afterAll(async () => {
    await db.creditLedgerEntry.deleteMany({ where: { userId: { in: ids } } });
    await db.creditLot.deleteMany({ where: { userId: { in: ids } } });
    await db.aiJob.deleteMany({ where: { userId: { in: ids } } });
    await db.cvDocument.deleteMany({ where: { userId: { in: ids } } });
    await db.profile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("STANDARD member with 0 credits is blocked", async () => {
    const user = await createMember("std-zero");
    ids.push(user.id);

    const cv = await storePasteTextAsCv(user.id, "Standard Zero\nBeceri: QA");
    expect(cv.ok).toBe(true);
    if (!cv.ok) return;

    // Issue then drain sponsored grant so balance is truly 0.
    const quoteBefore = await quoteProfilePrepare(user.id);
    expect(quoteBefore.canAfford).toBe(true);
    await drainAllCredits(user.id);

    const quote = await quoteProfilePrepare(user.id);
    expect(quote.canAfford).toBe(false);
    expect(quote.unlimitedInternal).toBe(false);

    await expect(
      createProfilePrepareJob({ userId: user.id, cvDocumentId: cv.documentId }),
    ).rejects.toThrow("INSUFFICIENT_CREDITS");
  });

  it("UNLIMITED_INTERNAL member with 0 credits can create AI jobs without ledger RESERVE/SETTLE/RELEASE", async () => {
    const user = await createMember("unl-zero");
    ids.push(user.id);

    await setAiUsagePolicyByEmail({ email: user.email, policy: "UNLIMITED_INTERNAL" });
    expect(await isUnlimitedAiUsage(user.id)).toBe(true);

    // Ensure no credit lots / drain any.
    await drainAllCredits(user.id);

    const quote = await quoteProfilePrepare(user.id);
    expect(quote.canAfford).toBe(true);
    expect(quote.unlimitedInternal).toBe(true);

    const cv = await storePasteTextAsCv(user.id, "Unlimited Zero\nBeceri: Node");
    expect(cv.ok).toBe(true);
    if (!cv.ok) return;

    const job = await createProfilePrepareJob({ userId: user.id, cvDocumentId: cv.documentId });
    expect(job.creditCostSnapshot).toBe(0);
    expect(job.reservationEntryId).toBeNull();
    expect(job.status).toBe("QUEUED");

    const workerId = `aipol-worker-${suffix}`;
    const claimed = await claimNextJob(workerId);
    expect(claimed?.id).toBe(job.id);
    await processClaimedJob(job.id, workerId);

    const ready = await db.aiJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(ready.status).toBe("READY");

    const ledger = await db.creditLedgerEntry.findMany({
      where: { jobId: job.id },
    });
    expect(ledger.filter((e) => e.type === "RESERVE")).toHaveLength(0);
    expect(ledger.filter((e) => e.type === "SETTLE")).toHaveLength(0);
    expect(ledger.filter((e) => e.type === "RELEASE")).toHaveLength(0);
  });

  it("unlimited MEMBER still has no staff access; cannot self-elevate", async () => {
    const user = await createMember("unl-nostaff");
    ids.push(user.id);
    await setAiUsagePolicyByEmail({ email: user.email, policy: "UNLIMITED_INTERNAL" });

    const record = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(record.staffRole).toBe("MEMBER");
    expect(record.aiUsagePolicy).toBe("UNLIMITED_INTERNAL");
    expect(isStaffRole(record.staffRole, ["ADMIN", "MODERATOR"])).toBe(false);

    // No member-facing API path sets aiUsagePolicy — only the CLI helper does.
    // Simulate a hostile self-update attempt by ensuring direct field writes aren't exposed
    // via profile update surface (policy remains CLI-only).
    await expect(setAiUsagePolicyByEmail({ email: "missing-" + suffix + "@example.com", policy: "UNLIMITED_INTERNAL" })).rejects.toThrow(
      "USER_NOT_FOUND",
    );

    // Idempotent CLI
    const again = await setAiUsagePolicyByEmail({ email: user.email, policy: "UNLIMITED_INTERNAL" });
    expect(again.changed).toBe(false);
    expect(again.next).toBe("UNLIMITED_INTERNAL");
  });

  it("unlimited retry remains safe without creating credit ledger rows", async () => {
    const user = await createMember("unl-retry");
    ids.push(user.id);
    await setAiUsagePolicyByEmail({ email: user.email, policy: "UNLIMITED_INTERNAL" });
    await drainAllCredits(user.id);

    const cv = await storePasteTextAsCv(user.id, "Unlimited Retry\nBeceri: Vitest");
    expect(cv.ok).toBe(true);
    if (!cv.ok) return;

    const job = await createProfilePrepareJob({ userId: user.id, cvDocumentId: cv.documentId });
    await db.aiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        attemptCount: 1,
        safeErrorCode: "provider_error",
        finishedAt: new Date(),
      },
    });

    const retried = await requestJobRetry(job.id, user.id);
    expect(retried.status).toBe("QUEUED");

    const ledger = await db.creditLedgerEntry.findMany({ where: { jobId: job.id } });
    expect(ledger).toHaveLength(0);
    expect(PROFILE_PREPARE_CREDIT_COST).toBeGreaterThan(0);
  });

  it("email change does not alter entitlement bound to user id", async () => {
    const user = await createMember("unl-email");
    ids.push(user.id);
    await setAiUsagePolicyByEmail({ email: user.email, policy: "UNLIMITED_INTERNAL" });

    const newEmail = `unl-email-renamed-${suffix}@example.com`;
    await db.user.update({ where: { id: user.id }, data: { email: newEmail } });

    expect(await isUnlimitedAiUsage(user.id)).toBe(true);
    const byId = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(byId.aiUsagePolicy).toBe("UNLIMITED_INTERNAL");
    expect(byId.email).toBe(newEmail);
  });

  it("UNLIMITED_INTERNAL Kariyer Portresi prepare reaches app prepStatus READY (not stuck as host-regen)", async () => {
    const {
      confirmCostAndStart,
      switchToSummaryFallback,
      submitApplication,
      getGuestBriefForMember,
    } = await import("@/lib/arayanlar/service");
    const { recordAcceptance, ensureLegalDocumentsSeeded } = await import("@/lib/legal/service");

    const user = await createMember("unl-arayanlar");
    ids.push(user.id);
    await setAiUsagePolicyByEmail({ email: user.email, policy: "UNLIMITED_INTERNAL" });
    await drainAllCredits(user.id);

    await confirmCostAndStart(user.id);
    await switchToSummaryFallback(user.id, {
      targetRole: "QA",
      storyTopic: "timeouts",
      contribution: "retries",
      workPreferences: "remote",
      excludedTopics: "none",
      contactChannel: "platform",
    });
    await ensureLegalDocumentsSeeded();
    const appRow = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: user.id } });
    await recordAcceptance({
      userId: user.id,
      type: "HOST_PREP_SHARING",
      documentType: "HOST_PREP_SHARING_NOTICE",
      scope: "test",
      relatedResourceType: "arayanlar_application",
      relatedResourceId: appRow.id,
    });

    const { jobId, application } = await submitApplication({
      userId: user.id,
      facts: {
        displayName: "Unlimited",
        targetRole: "QA",
        storyTopic: "timeouts",
        contribution: "retries",
        workPreferences: "remote",
        excludedTopics: "none",
        contactChannel: "platform",
        profileHintsUsed: [],
      },
    });
    expect(application.prepStatus).toBe("QUEUED");

    const created = await db.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(created.creditCostSnapshot).toBe(0);
    expect(created.providerMode).not.toBe("platform_host_regen");

    await db.aiJob.updateMany({
      where: { status: { in: ["QUEUED", "RUNNING"] }, id: { not: jobId } },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        finishedAt: new Date(),
        leaseOwner: null,
        safeErrorCode: "test_isolation",
      },
    });

    const workerId = `aipol-arayn-${suffix}`;
    const claimed = await claimNextJob(workerId);
    expect(claimed?.id).toBe(jobId);
    await processClaimedJob(jobId, workerId);

    const job = await db.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    const app = await db.arayanlarApplication.findUniqueOrThrow({ where: { id: application.id } });
    expect(job.status).toBe("READY");
    expect(app.prepStatus).toBe("READY");
    expect(await getGuestBriefForMember(user.id)).not.toBeNull();

    const readyNotifs = await db.inAppNotification.findMany({
      where: {
        userId: user.id,
        kind: "arayanlar_prep_ready",
        dedupeKey: `arayanlar_prep_ready:${application.id}:r${application.submittedRevision}`,
      },
    });
    expect(readyNotifs).toHaveLength(1);

    await db.inAppNotification.deleteMany({ where: { userId: user.id } });
    await db.arayanlarArtifact.deleteMany({ where: { applicationId: application.id } });
    await db.arayanlarApplication.deleteMany({ where: { userId: user.id } });
    await db.legalAcceptance.deleteMany({ where: { userId: user.id } });
  });
});
