import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDefaultProfileForUser } from "@/lib/profiles/service";
import { storePasteTextAsCv } from "@/lib/cv/service";
import {
  ARAYANLAR_WITHDRAW_UPDATE,
  assignHost,
  confirmCostAndStart,
  getOrCreateApplication,
  submitApplication,
  switchToSummaryFallback,
  toGuestApplicationView,
  withdrawApplication,
} from "@/lib/arayanlar/service";
import { grantHostAuthorization } from "@/lib/arayanlar/host-auth";
import { ARAYANLAR_WITHDRAW_FIELDS, runtimeModelFieldNames } from "@/lib/db";
import { ensureSponsoredArayanlarPrepareGrant } from "@/lib/credits/ledger";
import { processClaimedJob, claimNextJob } from "@/lib/ai/jobs";
import { recordAcceptance, ensureLegalDocumentsSeeded } from "@/lib/legal/service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `wd-${Date.now().toString(36)}`;

function readSrc(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

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

describe("withdraw update payload vs Prisma schema", () => {
  it("generated client exposes every field written by withdrawal", () => {
    const fields = runtimeModelFieldNames(db, "ArayanlarApplication");
    expect(fields).not.toBeNull();
    for (const field of ARAYANLAR_WITHDRAW_FIELDS) {
      expect(fields).toContain(field);
    }
    for (const key of Object.keys(ARAYANLAR_WITHDRAW_UPDATE)) {
      expect(fields).toContain(key);
    }
  });
});

describe("Kariyer Portresi withdrawal runtime", () => {
  let guestId = "";
  let hostId = "";
  let adminId = "";

  beforeAll(async () => {
    const guest = await db.user.create({
      data: {
        name: "WD Guest",
        email: `wd-guest-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const host = await db.user.create({
      data: {
        name: "WD Host",
        email: `wd-host-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const admin = await db.user.create({
      data: {
        name: "WD Admin",
        email: `wd-admin-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "ADMIN",
      },
    });
    guestId = guest.id;
    hostId = host.id;
    adminId = admin.id;
    await createDefaultProfileForUser(guest);
    await createDefaultProfileForUser(host);
    await grantHostAuthorization({
      userId: hostId,
      grantedByUserId: adminId,
      provenance: "wd-test",
    });
  });

  afterAll(async () => {
    await db.aiJob.deleteMany({ where: { userId: guestId } });
    await db.arayanlarArtifact.deleteMany({
      where: { application: { userId: guestId } },
    });
    await db.legalAcceptance.deleteMany({ where: { userId: guestId } });
    await db.arayanlarApplication.deleteMany({ where: { userId: guestId } });
    await db.hostAuthorization.deleteMany({ where: { userId: hostId } });
    await db.cvDocument.deleteMany({ where: { userId: guestId } });
    await db.creditLedgerEntry.deleteMany({ where: { userId: guestId } });
    await db.creditLot.deleteMany({ where: { userId: guestId } });
    await db.inAppNotification.deleteMany({
      where: { userId: { in: [guestId, hostId] } },
    });
    await db.profile.deleteMany({ where: { userId: { in: [guestId, hostId, adminId] } } });
    await db.user.deleteMany({ where: { id: { in: [guestId, hostId, adminId] } } });
    await db.$disconnect();
  });

  async function makeReadyApplication() {
    await ensureSponsoredArayanlarPrepareGrant(guestId);
    await getOrCreateApplication(guestId);
    await confirmCostAndStart(guestId);
    await switchToSummaryFallback(guestId, {
      targetRole: "QA",
      storyTopic: "withdraw readiness",
      contribution: "owned quality",
      workPreferences: "remote",
      excludedTopics: "none",
      contactChannel: "email",
    });
    await acceptHostPrep(guestId);
    const facts = {
      displayName: "WD Guest",
      targetRole: "QA",
      storyTopic: "withdraw readiness",
      contribution: "owned quality",
      workPreferences: "remote",
      excludedTopics: "none",
      contactChannel: "email",
      profileHintsUsed: [] as string[],
    };
    const { jobId } = await submitApplication({ userId: guestId, facts });

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
        safeErrorMessage: "Parked for withdraw isolation",
      },
    });

    const workerId = `wd-worker-${suffix}`;
    const claimed = await claimNextJob(workerId);
    expect(claimed?.id).toBe(jobId);
    await processClaimedJob(jobId, workerId);
    return db.arayanlarApplication.findUniqueOrThrow({ where: { userId: guestId } });
  }

  it("withdraws a READY application with host, schedule, and pending publication review", async () => {
    const cv = await storePasteTextAsCv(
      guestId,
      "Quality engineer focused on Playwright and API contracts.",
    );
    expect(cv.ok).toBe(true);

    const app = await makeReadyApplication();
    expect(app.prepStatus).toBe("READY");

    await assignHost({
      applicationId: app.id,
      hostUserId: hostId,
      assignedByUserId: adminId,
    });

    await db.arayanlarApplication.update({
      where: { id: app.id },
      data: {
        recordingScheduledAt: new Date("2026-10-01T10:00:00.000Z"),
        recordingTimezone: "Europe/Istanbul",
        recordingMeetingUrl: "https://meet.example.com/wd",
        recordingSchedulingNote: "probe",
        recordingScheduledByUserId: hostId,
        recordingScheduleUpdatedAt: new Date(),
        publicationReviewRequestedAt: new Date(),
        publicationReviewVersionId: "ver-wd-1",
        publicationChangeRequestNote: "pending note",
        publicationChangeRequestedAt: new Date(),
      },
    });

    const beforeLedger = await db.creditLedgerEntry.count({
      where: { userId: guestId, type: "RELEASE" },
    });

    const withdrawn = await withdrawApplication(guestId);
    expect(withdrawn.status).toBe("WITHDRAWN");
    expect(withdrawn.prepStatus).toBe("CANCELLED");
    expect(withdrawn.assignedHostUserId).toBeNull();
    expect(withdrawn.assignedAt).toBeNull();
    expect(withdrawn.assignedByUserId).toBeNull();
    expect(withdrawn.recordingScheduledAt).toBeNull();
    expect(withdrawn.recordingMeetingUrl).toBeNull();
    expect(withdrawn.recordingTimezone).toBeNull();
    expect(withdrawn.publicationReviewRequestedAt).toBeNull();
    expect(withdrawn.publicationReviewVersionId).toBeNull();
    expect(withdrawn.publicationChangeRequestNote).toBeNull();

    const afterLedger = await db.creditLedgerEntry.count({
      where: { userId: guestId, type: "RELEASE" },
    });
    // READY jobs are settled — withdraw must not create an extra RELEASE.
    expect(afterLedger).toBe(beforeLedger);

    const cvCount = await db.cvDocument.count({ where: { userId: guestId, deletedAt: null } });
    expect(cvCount).toBeGreaterThan(0);

    const guestJson = JSON.stringify(toGuestApplicationView(withdrawn));
    expect(guestJson).not.toContain("Playwright");
    expect(guestJson).not.toContain("meet.example.com");

    const again = await withdrawApplication(guestId);
    expect(again.status).toBe("WITHDRAWN");
    const notifs = await db.inAppNotification.findMany({
      where: { userId: guestId, kind: "arayanlar_application_withdrawn" },
    });
    expect(notifs).toHaveLength(1);

    const releases = await db.creditLedgerEntry.count({
      where: { userId: guestId, type: "RELEASE" },
    });
    expect(releases).toBe(afterLedger);
  });

  it("API withdraw catch does not return raw Prisma text", () => {
    const src = readSrc("src/app/api/arayanlar/gonder/route.ts");
    expect(src).toContain("WITHDRAW_FAILED");
    expect(src).toContain("Başvuru şu anda geri çekilemedi");
    expect(src).toContain("PrismaClientValidationError");
    // Withdraw path maps validation failures to the safe Turkish message only.
    expect(src).toMatch(
      /action === "withdraw"[\s\S]*Başvuru şu anda geri çekilemedi\. Lütfen yeniden dene\./,
    );
  });
});

describe("CV upload control in guest flow", () => {
  it("shows CvUploadControl when no usable CV; READY screen has no upload", () => {
    const src = readSrc("src/components/arayanlar/guest-flow.tsx");
    expect(src).toContain("<CvUploadControl");
    expect(src).toContain("cvDocs.length ?");
    const readyIdx = src.indexOf('facing === "READY"');
    expect(readyIdx).toBeGreaterThan(-1);
    const readySlice = src.slice(readyIdx, readyIdx + 1200);
    expect(readySlice).not.toContain("CvUploadControl");
    expect(readySlice).toContain("Notlarımı aç");
  });
});
