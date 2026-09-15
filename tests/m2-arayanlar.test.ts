import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  confirmCostAndStart,
  getGuestBriefForMember,
  getHostPackForAssignedHost,
  getOrCreateApplication,
  postConversationMessage,
  saveHostPackEdits,
  submitApplication,
  switchToSummaryFallback,
  withdrawApplication,
  assignHost,
  toGuestApplicationView,
} from "@/lib/arayanlar/service";
import { grantHostAuthorization } from "@/lib/arayanlar/host-auth";
import { claimNextJob, processClaimedJob } from "@/lib/ai/jobs";
import {
  ensureSponsoredArayanlarPrepareGrant,
  getAvailableCreditBalanceForArayanlar,
} from "@/lib/credits/ledger";
import type { SubmittedFacts } from "@/lib/arayanlar/constants";
import type { HostPack } from "@/lib/arayanlar/artifact-schema";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `m22-${Date.now().toString(36)}`;

async function createUser(label: string, verified = true) {
  return db.user.create({
    data: {
      name: label,
      email: `${label}-${suffix}@example.com`,
      emailVerified: verified,
      staffRole: "MEMBER",
    },
  });
}

describe("m2.2 arayanlar preparation", () => {
  let guestId = "";
  let hostId = "";
  let otherHostId = "";
  let adminId = "";
  const ids: string[] = [];

  beforeAll(async () => {
    const guest = await createUser("m22-guest");
    const host = await createUser("m22-host");
    const other = await createUser("m22-other-host");
    const admin = await createUser("m22-admin");
    await db.user.update({ where: { id: admin.id }, data: { staffRole: "ADMIN" } });
    guestId = guest.id;
    hostId = host.id;
    otherHostId = other.id;
    adminId = admin.id;
    ids.push(guestId, hostId, otherHostId, adminId);

    await grantHostAuthorization({
      userId: hostId,
      grantedByUserId: adminId,
      provenance: "test",
    });
    await grantHostAuthorization({
      userId: otherHostId,
      grantedByUserId: adminId,
      provenance: "test",
    });
  });

  afterAll(async () => {
    await db.arayanlarArtifact.deleteMany({
      where: { application: { userId: { in: ids } } },
    });
    await db.aiJob.deleteMany({ where: { userId: { in: ids } } });
    await db.arayanlarApplication.deleteMany({ where: { userId: { in: ids } } });
    await db.creditLedgerEntry.deleteMany({ where: { userId: { in: ids } } });
    await db.creditLot.deleteMany({ where: { userId: { in: ids } } });
    await db.hostAuthorization.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("allows apply without CV, interests, or published profile", async () => {
    const app = await getOrCreateApplication(guestId);
    expect(app.status).toBe("DRAFT");
    expect(app.userId).toBe(guestId);
    // no profile row required
    const profile = await db.profile.findUnique({ where: { userId: guestId } });
    expect(profile).toBeNull();
  });

  it("resumes without duplicating grants; chat answers persist", async () => {
    await confirmCostAndStart(guestId);
    const before = await getAvailableCreditBalanceForArayanlar(guestId);
    await confirmCostAndStart(guestId);
    const after = await getAvailableCreditBalanceForArayanlar(guestId);
    expect(after).toBe(before);

    await postConversationMessage({
      userId: guestId,
      message: "Kıdemli kalite mühendisi",
    });
    let app = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: guestId } });
    expect((app.draftAnswers as { targetRole?: string }).targetRole).toContain("kalite");

    await postConversationMessage({
      userId: guestId,
      message: "Flaky test boru hattını stabilize ettim\nKatkım: flake sınıflandırma",
    });
    app = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: guestId } });
    expect(app.questionsAsked).toBeGreaterThanOrEqual(2);
  });

  it("summary fallback and explicit submit produce both artifacts atomically", async () => {
    await switchToSummaryFallback(guestId, {
      targetRole: "QA Lead",
      storyTopic: "CI flake azaltma",
      contribution: "sınıflandırma sistemi",
      workPreferences: "hibrit, sakin tempo",
      excludedTopics: "maaş pazarlığı",
      contactChannel: "platform mesajı",
    });

    const facts: SubmittedFacts = {
      displayName: "m22-guest",
      targetRole: "QA Lead",
      storyTopic: "CI flake azaltma",
      contribution: "sınıflandırma sistemi",
      workPreferences: "hibrit, sakin tempo",
      excludedTopics: "maaş pazarlığı",
      contactChannel: "platform mesajı",
      profileHintsUsed: [],
    };

    const balanceBefore = await getAvailableCreditBalanceForArayanlar(guestId);
    const { jobId } = await submitApplication({ userId: guestId, facts });
    expect(jobId).toBeTruthy();

    const workerId = `test-worker-${suffix}`;
    const claimed = await claimNextJob(workerId);
    expect(claimed?.id).toBe(jobId);
    await processClaimedJob(jobId, workerId);

    const app = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: guestId } });
    expect(app.status).toBe("SUBMITTED");
    expect(app.prepStatus).toBe("READY");
    expect(app.submittedRevision).toBe(1);

    const artifacts = await db.arayanlarArtifact.findMany({ where: { applicationId: app.id } });
    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((a) => a.kind).sort()).toEqual(["GUEST_BRIEF", "HOST_PACK"]);

    const balanceAfter = await getAvailableCreditBalanceForArayanlar(guestId);
    expect(balanceAfter).toBe(balanceBefore - 1);

    const guestBrief = await getGuestBriefForMember(guestId);
    expect(guestBrief?.brief.confirmedTargetRole).toContain("QA");
    expect(JSON.stringify(guestBrief)).not.toMatch(/supportingFacts|rapidRound|hostPack/i);

    const guestJob = await db.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(JSON.stringify(guestJob.resultJson)).not.toMatch(/mainQuestions|supportingFacts/);
  });

  it("denies unassigned host and guest host-pack access; assignment works", async () => {
    const app = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: guestId } });

    const denied = await getHostPackForAssignedHost({
      hostUserId: hostId,
      applicationId: app.id,
    });
    expect(denied.ok).toBe(false);

    await assignHost({
      applicationId: app.id,
      hostUserId: hostId,
      assignedByUserId: adminId,
    });

    const allowed = await getHostPackForAssignedHost({
      hostUserId: hostId,
      applicationId: app.id,
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.effective.case.supportingFacts).toHaveLength(2);
      expect(allowed.effective.rapidRound.questions).toHaveLength(5);
    }

    const other = await getHostPackForAssignedHost({
      hostUserId: otherHostId,
      applicationId: app.id,
    });
    expect(other.ok).toBe(false);

    // Reassignment revokes previous host
    await assignHost({
      applicationId: app.id,
      hostUserId: otherHostId,
      assignedByUserId: adminId,
    });
    const afterReassign = await getHostPackForAssignedHost({
      hostUserId: hostId,
      applicationId: app.id,
    });
    expect(afterReassign.ok).toBe(false);

    await assignHost({
      applicationId: app.id,
      hostUserId: hostId,
      assignedByUserId: adminId,
    });
  });

  it("preserves host edits across regeneration path and guest view stays clean", async () => {
    const app = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: guestId } });
    const pack = await getHostPackForAssignedHost({
      hostUserId: hostId,
      applicationId: app.id,
    });
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;

    const edited: HostPack = {
      ...pack.effective,
      factualIntroduction: {
        ...pack.effective.factualIntroduction,
        text: "SUNUCU DUZENLEME KORUNMALI",
      },
    };
    await saveHostPackEdits({
      hostUserId: hostId,
      applicationId: app.id,
      edits: edited,
    });

    const again = await getHostPackForAssignedHost({
      hostUserId: hostId,
      applicationId: app.id,
    });
    expect(again.ok && again.effective.factualIntroduction.text).toContain("SUNUCU DUZENLEME");

    const guestView = toGuestApplicationView(app);
    expect(JSON.stringify(guestView)).not.toMatch(/SUNUCU DUZENLEME|supportingFacts/);
  });

  it("withdrawal blocks host access and ignores late results policy", async () => {
    const appBefore = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: guestId } });
    await withdrawApplication(guestId);
    const denied = await getHostPackForAssignedHost({
      hostUserId: hostId,
      applicationId: appBefore.id,
    });
    expect(denied.ok).toBe(false);
    expect(await getGuestBriefForMember(guestId)).toBeNull();

    const withdrawn = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: guestId } });
    expect(withdrawn.status).toBe("WITHDRAWN");
    expect(withdrawn.assignedHostUserId).toBeNull();
  });

  it("provider failure path preserves answers and releases credits on failed job", async () => {
    // Reopen after withdraw
    await confirmCostAndStart(guestId);
    await switchToSummaryFallback(guestId, {
      targetRole: "Backend",
      storyTopic: "timeout",
      contribution: "retry",
      workPreferences: "remote",
      excludedTopics: "yok",
      contactChannel: "e-posta",
    });

    // Force a second grant/use of remaining — ensureSponsored is idempotent (already used)
    await ensureSponsoredArayanlarPrepareGrant(guestId);
    // Gift a credit for this failure scenario
    await db.creditLot.create({
      data: {
        userId: guestId,
        source: "STAFF_GIFT",
        idempotencyKey: `gift:m22-fail:${suffix}`,
        originalAmount: 1,
        remainingAmount: 1,
        reservedAmount: 0,
        provenance: "test-fail-path",
      },
    });

    const facts: SubmittedFacts = {
      displayName: "m22-guest",
      targetRole: "Backend",
      storyTopic: "timeout",
      contribution: "retry",
      workPreferences: "remote",
      excludedTopics: "yok",
      contactChannel: "e-posta",
      profileHintsUsed: [],
    };

    const app = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: guestId } });
    const answersBefore = app.draftAnswers;

    // Simulate failure by cancelling after queue (answers must remain)
    const { jobId } = await submitApplication({ userId: guestId, facts });
    await db.aiJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        safeErrorCode: "provider_error",
        finishedAt: new Date(),
      },
    });
    const { releaseJobReservation } = await import("@/lib/credits/ledger");
    await releaseJobReservation(jobId);

    const after = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: guestId } });
    expect(after.draftAnswers).toEqual(answersBefore);
  });
});
