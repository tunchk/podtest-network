/**
 * Synthetic Kariyer Portresi prepare lifecycle for local verification.
 * Does not print secrets, CV text, or PII beyond opaque ids.
 */
import { loadAppEnvironment } from "../src/lib/env/load-app-env";

loadAppEnvironment();

async function main() {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { createDefaultProfileForUser } = await import("../src/lib/profiles/service");
  const {
    confirmCostAndStart,
    switchToSummaryFallback,
    submitApplication,
    reconcileArayanlarPrepStatusFromJob,
    getGuestBriefForMember,
  } = await import("../src/lib/arayanlar/service");
  const { claimNextJob, processClaimedJob } = await import("../src/lib/ai/jobs");
  const { setAiUsagePolicyByEmail } = await import("../src/lib/ai/usage-policy");
  const { recordAcceptance, ensureLegalDocumentsSeeded } = await import("../src/lib/legal/service");
  const { resolveProviderConfig } = await import("../src/lib/ai/provider");

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const suffix = `synth-${Date.now().toString(36)}`;
  const provider = resolveProviderConfig();

  const user = await db.user.create({
    data: {
      name: "Synth Guest",
      email: `synth-guest-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "MEMBER",
      aiUsagePolicy: "UNLIMITED_INTERNAL",
    },
  });
  await createDefaultProfileForUser(user);
  await setAiUsagePolicyByEmail({ email: user.email, policy: "UNLIMITED_INTERNAL" });

  const transitions: string[] = [];
  const log = (label: string, extra?: Record<string, unknown>) => {
    transitions.push(label);
    console.log(JSON.stringify({ step: label, ...extra }));
  };

  await confirmCostAndStart(user.id);
  await switchToSummaryFallback(user.id, {
    targetRole: "QA",
    storyTopic: "flake triage",
    contribution: "taxonomy",
    workPreferences: "remote",
    excludedTopics: "none",
    contactChannel: "platform",
  });

  await ensureLegalDocumentsSeeded();
  const app0 = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: user.id } });
  await recordAcceptance({
    userId: user.id,
    type: "HOST_PREP_SHARING",
    documentType: "HOST_PREP_SHARING_NOTICE",
    scope: "synth",
    relatedResourceType: "arayanlar_application",
    relatedResourceId: app0.id,
  });

  const { jobId, application } = await submitApplication({
    userId: user.id,
    facts: {
      displayName: "Synth",
      targetRole: "QA",
      storyTopic: "flake triage",
      contribution: "taxonomy",
      workPreferences: "remote",
      excludedTopics: "none",
      contactChannel: "platform",
      profileHintsUsed: [],
    },
  });
  log("SUBMITTED", {
    applicationId: application.id,
    jobId,
    prepStatus: application.prepStatus,
    creditCostSnapshot: 0,
    providerModeAtCreate: null,
  });

  const jobQueued = await db.aiJob.findUniqueOrThrow({ where: { id: jobId } });
  log("JOB_QUEUED", {
    jobId,
    kind: jobQueued.kind,
    status: jobQueued.status,
    attemptCount: jobQueued.attemptCount,
    creditCostSnapshot: jobQueued.creditCostSnapshot,
  });

  // Park other queued jobs so we claim ours.
  await db.aiJob.updateMany({
    where: { status: { in: ["QUEUED", "RUNNING"] }, id: { not: jobId } },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      finishedAt: new Date(),
      leaseOwner: null,
      safeErrorCode: "synth_isolation",
    },
  });

  const workerId = `synth-worker-${suffix}`;
  const claimed = await claimNextJob(workerId);
  if (!claimed || claimed.id !== jobId) {
    throw new Error(`claim mismatch claimed=${claimed?.id} expected=${jobId}`);
  }
  log("RUNNING", {
    jobId,
    attemptCount: claimed.attemptCount,
    leaseOwner: claimed.leaseOwner,
  });

  await processClaimedJob(jobId, workerId);

  const jobDone = await db.aiJob.findUniqueOrThrow({ where: { id: jobId } });
  const appDone = await db.arayanlarApplication.findUniqueOrThrow({ where: { id: application.id } });
  log(jobDone.status === "READY" ? "READY" : `JOB_${jobDone.status}`, {
    jobId,
    jobStatus: jobDone.status,
    prepStatus: appDone.prepStatus,
    attemptCount: jobDone.attemptCount,
    providerMode: jobDone.providerMode,
    openaiCalled: provider.mode === "openai" && jobDone.providerMode === "openai",
  });

  if (appDone.prepStatus !== "READY") {
    const healed = await reconcileArayanlarPrepStatusFromJob(user.id);
    log("HEAL_ATTEMPTED", { prepStatus: healed?.prepStatus });
  }

  const brief = await getGuestBriefForMember(user.id);
  const readyNotifs = await db.inAppNotification.findMany({
    where: {
      userId: user.id,
      kind: "arayanlar_prep_ready",
      dedupeKey: `arayanlar_prep_ready:${application.id}:r${application.submittedRevision}`,
    },
  });
  const artifacts = await db.arayanlarArtifact.count({
    where: {
      applicationId: application.id,
      submittedRevision: application.submittedRevision,
    },
  });

  console.log(
    JSON.stringify({
      summary: {
        transition: transitions.join(" → "),
        jobId,
        jobKind: jobDone.kind,
        applicationId: application.id,
        finalJobStatus: jobDone.status,
        finalPrepStatus: (await db.arayanlarApplication.findUniqueOrThrow({ where: { id: application.id } }))
          .prepStatus,
        artifactsForRevision: artifacts,
        notesAccessible: Boolean(brief),
        readyNotificationCount: readyNotifs.length,
        providerConfigMode: provider.mode,
      },
    }),
  );

  // Cleanup synthetic fixtures
  await db.inAppNotification.deleteMany({ where: { userId: user.id } });
  await db.arayanlarArtifact.deleteMany({ where: { applicationId: application.id } });
  await db.aiJob.deleteMany({ where: { userId: user.id } });
  await db.arayanlarApplication.deleteMany({ where: { userId: user.id } });
  await db.legalAcceptance.deleteMany({ where: { userId: user.id } });
  await db.creditLedgerEntry.deleteMany({ where: { userId: user.id } });
  await db.creditLot.deleteMany({ where: { userId: user.id } });
  await db.profile.deleteMany({ where: { userId: user.id } });
  await db.user.delete({ where: { id: user.id } });
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
