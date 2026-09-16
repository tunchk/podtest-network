import { loadAppEnvironment } from "../src/lib/env/load-app-env";

loadAppEnvironment();

/**
 * Live M2.2 verification with the configured real provider.
 * Creates synthetic users, runs Arayanlar prepare through the worker,
 * checks credit settlement and assigned-host access.
 *
 * Does not send invitations or mutate .env.
 */
async function main() {
  const { randomUUID } = await import("node:crypto");
  const { prisma } = await import("../src/lib/db");
  const { resolveProviderConfig } = await import("../src/lib/ai/provider");
  const {
    confirmCostAndStart,
    switchToSummaryFallback,
    submitApplication,
    assignHost,
    getGuestBriefForMember,
    getHostPackForAssignedHost,
  } = await import("../src/lib/arayanlar/service");
  const { grantHostAuthorization } = await import("../src/lib/arayanlar/host-auth");
  const { claimNextJob, processClaimedJob } = await import("../src/lib/ai/jobs");
  const { getAvailableCreditBalanceForArayanlar } = await import("../src/lib/credits/ledger");

  const provider = resolveProviderConfig();
  console.log(`[live-m22] provider mode=${provider.mode} demoStub=${provider.demoStub}`);
  if (provider.mode !== "openai") {
    console.error("[live-m22] FAIL: expected openai provider for live verify");
    process.exit(1);
  }

  const suffix = randomUUID().slice(0, 8);
  const guest = await prisma.user.create({
    data: {
      name: `Live Guest ${suffix}`,
      email: `live-guest-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "MEMBER",
    },
  });
  const host = await prisma.user.create({
    data: {
      name: `Live Host ${suffix}`,
      email: `live-host-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "MEMBER",
    },
  });
  const admin = await prisma.user.create({
    data: {
      name: `Live Admin ${suffix}`,
      email: `live-admin-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "ADMIN",
    },
  });

  try {
    await grantHostAuthorization({
      userId: host.id,
      grantedByUserId: admin.id,
      provenance: "live-verify-m22",
    });

    await confirmCostAndStart(guest.id);
    await switchToSummaryFallback(guest.id, {
      targetRole: "Platform mühendisi",
      storyTopic: "Dağıtım sırasında geri alma planı",
      contribution: "Canary ve otomatik rollback tasarımı",
      workPreferences: "Uzaktan, yazılı iletişim ağırlıklı",
      excludedTopics: "Maaş rakamları",
      contactChannel: "Platform mesajı",
    });

    const before = await getAvailableCreditBalanceForArayanlar(guest.id);
    const { jobId, application } = await submitApplication({
      userId: guest.id,
      facts: {
        displayName: guest.name,
        targetRole: "Platform mühendisi",
        storyTopic: "Dağıtım sırasında geri alma planı",
        contribution: "Canary ve otomatik rollback tasarımı",
        workPreferences: "Uzaktan, yazılı iletişim ağırlıklı",
        excludedTopics: "Maaş rakamları",
        contactChannel: "Platform mesajı",
        profileHintsUsed: [],
      },
    });

    console.log(`[live-m22] submitted application=${application.id} job=${jobId}`);

    const workerId = `live-m22-${suffix}`;
    let ready = false;
    for (let i = 0; i < 8; i++) {
      const appProbe = await prisma.arayanlarApplication.findUniqueOrThrow({
        where: { id: application.id },
      });
      if (appProbe.prepStatus === "READY") {
        ready = true;
        break;
      }
      if (appProbe.prepStatus === "FAILED") {
        const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
        throw new Error(`prep failed: ${job?.safeErrorCode} ${job?.safeErrorMessage}`);
      }

      const claimed = await claimNextJob(workerId);
      if (!claimed) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      await processClaimedJob(claimed.id, workerId);
    }

    if (!ready) {
      const appProbe = await prisma.arayanlarApplication.findUniqueOrThrow({
        where: { id: application.id },
      });
      if (appProbe.prepStatus !== "READY") {
        const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
        throw new Error(
          `prepStatus=${appProbe.prepStatus} job=${job?.safeErrorCode} ${job?.safeErrorMessage}`,
        );
      }
    }

    const app = await prisma.arayanlarApplication.findUniqueOrThrow({ where: { id: application.id } });
    const after = await getAvailableCreditBalanceForArayanlar(guest.id);
    if (after !== before - 1) {
      throw new Error(`credit settle mismatch before=${before} after=${after}`);
    }

    const brief = await getGuestBriefForMember(guest.id);
    if (!brief) throw new Error("guest brief missing");
    if (JSON.stringify(brief).includes("supportingFacts")) {
      throw new Error("host fields leaked into guest brief payload");
    }

    await assignHost({
      applicationId: app.id,
      hostUserId: host.id,
      assignedByUserId: admin.id,
    });

    const hostPack = await getHostPackForAssignedHost({
      hostUserId: host.id,
      applicationId: app.id,
    });
    if (!hostPack.ok) throw new Error(`host denied: ${hostPack.reason}`);
    if (hostPack.effective.rapidFire.length < 5) {
      throw new Error("rapid fire incomplete");
    }

    console.log("[live-m22] LIVE_VERIFY_PASS");
    console.log(
      JSON.stringify({
        applicationId: app.id,
        jobId,
        guestStoryTitle: brief.brief.storyCandidates[0]?.title ?? null,
        hostThinkingScenarioChars: hostPack.effective.thinkingScenario.scenario.length,
        creditsBefore: before,
        creditsAfter: after,
      }),
    );
  } finally {
    await prisma.arayanlarArtifact.deleteMany({
      where: { application: { userId: { in: [guest.id, host.id, admin.id] } } },
    });
    await prisma.aiJob.deleteMany({ where: { userId: { in: [guest.id, host.id, admin.id] } } });
    await prisma.arayanlarApplication.deleteMany({
      where: { userId: { in: [guest.id, host.id, admin.id] } },
    });
    await prisma.creditLedgerEntry.deleteMany({
      where: { userId: { in: [guest.id, host.id, admin.id] } },
    });
    await prisma.creditLot.deleteMany({ where: { userId: { in: [guest.id, host.id, admin.id] } } });
    await prisma.hostAuthorization.deleteMany({
      where: { userId: { in: [guest.id, host.id, admin.id] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [guest.id, host.id, admin.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[live-m22] FAIL", error);
  process.exitCode = 1;
});
