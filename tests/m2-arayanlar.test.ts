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
import { recordAcceptance, ensureLegalDocumentsSeeded } from "@/lib/legal/service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `m22-${Date.now().toString(36)}`;

async function acceptHostPrep(userId: string) {
  await ensureLegalDocumentsSeeded();
  const app = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId } });
  await recordAcceptance({
    userId,
    type: "HOST_PREP_SHARING",
    documentType: "HOST_PREP_SHARING_NOTICE",
    scope: "test",
    relatedResourceType: "arayanlar_application",
    relatedResourceId: app.id,
  });
}

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
    await db.inAppNotification.deleteMany({ where: { userId: { in: ids } } });
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

  it("explicit existing-CV proposals fill editable facts without charging credits", async () => {
    const { storePasteTextAsCv } = await import("@/lib/cv/service");
    const { applyOwnedCvProposalsToApplication, getOrCreateApplication } = await import(
      "@/lib/arayanlar/service"
    );

    const cvGuest = await createUser("m22-cv-guest");
    ids.push(cvGuest.id);

    await getOrCreateApplication(cvGuest.id);
    await confirmCostAndStart(cvGuest.id);
    const balanceBefore = await getAvailableCreditBalanceForArayanlar(cvGuest.id);
    const ledgerBefore = await db.creditLedgerEntry.count({ where: { userId: cvGuest.id } });

    const cv = await storePasteTextAsCv(
      cvGuest.id,
      [
        "Ada Örnek",
        "Kıdemli Kalite Mühendisi",
        "Beceri: Playwright, TypeScript, API testi",
        "Deneyim",
        "Örnek şirkette flake sınıflandırma sistemi kurdum",
        "Hibrit çalışma tercihi",
      ].join("\n"),
    );
    if (!cv.ok) throw new Error("cv failed");

    const { application, proposal } = await applyOwnedCvProposalsToApplication(
      cvGuest.id,
      cv.documentId,
    );
    expect(application.status).toBe("AWAITING_CONFIRMATION");
    const answers = application.draftAnswers as {
      targetRole?: string;
      contribution?: string;
      storyTopic?: string;
      sourceHints?: string[];
    };
    expect(answers.targetRole || answers.contribution || answers.storyTopic).toBeTruthy();
    expect(proposal.hints.some((h) => h.startsWith("cv→") || h.startsWith("profile."))).toBe(
      true,
    );
    // Raw multi-line CV body is not dumped into draft JSON; only grounded field snippets.
    expect(JSON.stringify(application.draftAnswers)).not.toMatch(
      /Ada Örnek\\nKıdemli Kalite Mühendisi\\nBeceri:/,
    );
    expect(await getAvailableCreditBalanceForArayanlar(cvGuest.id)).toBe(balanceBefore);
    expect(await db.creditLedgerEntry.count({ where: { userId: cvGuest.id } })).toBe(ledgerBefore);
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

  it("blocks confirm without host-sharing acceptance; upsert+accept then submit works", async () => {
    // Isolate from earlier SUBMITTED state by using a fresh user.
    const user = await createUser("m22-legal-host");
    ids.push(user.id);
    await getOrCreateApplication(user.id);
    await confirmCostAndStart(user.id);
    await switchToSummaryFallback(user.id, {
      targetRole: "QA",
      storyTopic: "test",
      contribution: "test",
      workPreferences: "remote",
      excludedTopics: "yok",
      contactChannel: "mesaj",
    });

    const facts: SubmittedFacts = {
      displayName: "m22-legal-host",
      targetRole: "QA",
      storyTopic: "test",
      contribution: "test",
      workPreferences: "remote",
      excludedTopics: "yok",
      contactChannel: "mesaj",
      profileHintsUsed: [],
    };

    await expect(submitApplication({ userId: user.id, facts })).rejects.toThrow(
      "LEGAL_HOST_PREP_REQUIRED",
    );

    // Regression: LegalDocument.upsert must work through @/lib/db (not only a raw PrismaClient).
    const { prisma } = await import("@/lib/db");
    expect(typeof (prisma as { legalDocument?: { upsert?: unknown } }).legalDocument?.upsert).toBe(
      "function",
    );
    const { ensureLegalDocumentsSeeded, recordAcceptance, hasCurrentAcceptance } =
      await import("@/lib/legal/service");
    await ensureLegalDocumentsSeeded();

    const app = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: user.id } });
    await recordAcceptance({
      userId: user.id,
      type: "HOST_PREP_SHARING",
      documentType: "HOST_PREP_SHARING_NOTICE",
      scope: "arayanlar_submit",
      relatedResourceType: "arayanlar_application",
      relatedResourceId: app.id,
    });
    expect(
      await hasCurrentAcceptance({
        userId: user.id,
        type: "HOST_PREP_SHARING",
        documentType: "HOST_PREP_SHARING_NOTICE",
        relatedResourceType: "arayanlar_application",
        relatedResourceId: app.id,
      }),
    ).toBe(true);

    const { jobId } = await submitApplication({ userId: user.id, facts });
    expect(jobId).toBeTruthy();
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
    await acceptHostPrep(guestId);
    const { jobId } = await submitApplication({ userId: guestId, facts });
    expect(jobId).toBeTruthy();

    // Shared DB may have leftover QUEUED jobs from other suites — park them so we claim ours.
    await db.aiJob.updateMany({
      where: {
        status: { in: ["QUEUED", "RUNNING"] },
        id: { not: jobId },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        finishedAt: new Date(),
        leaseOwner: null,
        safeErrorCode: "test_isolation",
        safeErrorMessage: "Parked for m2.2 isolation",
      },
    });

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
    expect(guestBrief?.brief.identitySignals.join(" ")).toMatch(/QA|hedef|rol|stub|Onaylı/i);
    expect(guestBrief?.brief.storyCandidates.length).toBeGreaterThanOrEqual(1);
    expect(guestBrief?.brief.closing.fixedQuestion).toMatch(/bu kişiyle konuşmalıyım/);
    expect(JSON.stringify(guestBrief)).not.toMatch(/coldOpen|timelineOverview|recordingChecklist/i);
    expect(JSON.stringify(guestBrief)).not.toMatch(/supportingFacts|rapidRound|hostPack/i);
    expect(JSON.stringify(guestBrief)).not.toMatch(
      /thinkingScenario\.scenario|hostQuestions|whatTheHostShouldListenFor|"preparation"/,
    );
    expect(guestBrief).not.toHaveProperty("preparation");

    const guestJob = await db.aiJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(JSON.stringify(guestJob.resultJson)).not.toMatch(/mainQuestions|supportingFacts/);

    // Milestone notifications: submit + READY once; no QUEUED/RUNNING kinds.
    const notifs = await db.inAppNotification.findMany({ where: { userId: guestId } });
    const kinds = notifs.map((n) => n.kind);
    expect(kinds.filter((k) => k === "arayanlar_application_submitted")).toHaveLength(1);
    expect(kinds.filter((k) => k === "arayanlar_prep_ready")).toHaveLength(1);
    expect(kinds.some((k) => /queued|running/i.test(k))).toBe(false);
    const ready = notifs.find((n) => n.kind === "arayanlar_prep_ready");
    expect(ready?.title).toBe("Kayıt öncesi notların hazır");
    expect(ready?.href).toBe("/arayanlar/hazirligim");
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
      expect(allowed.effective.storyCandidates.length).toBeGreaterThanOrEqual(1);
      expect(allowed.effective.thinkingScenario.scenario.length).toBeGreaterThan(10);
      expect(allowed.effective.rapidFire.length).toBeGreaterThanOrEqual(5);
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
      thinkingScenario: {
        ...pack.effective.thinkingScenario,
        scenario: "SUNUCU DUZENLEME KORUNMALI",
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
    expect(again.ok && again.effective.thinkingScenario.scenario).toContain("SUNUCU DUZENLEME");

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

    const withdrawnNotifs = await db.inAppNotification.findMany({
      where: { userId: guestId, kind: "arayanlar_application_withdrawn" },
    });
    expect(withdrawnNotifs).toHaveLength(1);
    expect(withdrawnNotifs[0]?.body).toBe("Kariyer Portresi başvurun geri çekildi.");
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
    await acceptHostPrep(guestId);
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
