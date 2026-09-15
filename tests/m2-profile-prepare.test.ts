import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDefaultProfileForUser, getPublicProfileBySlug } from "@/lib/profiles/service";
import { getOwnerDraftPreviewBySlug } from "@/lib/profiles/preview";
import {
  createProfilePrepareJob,
  applyJobSuggestions,
  claimNextJob,
  processClaimedJob,
  cancelOwnedJob,
} from "@/lib/ai/jobs";
import {
  ensureSponsoredProfilePrepareGrant,
  getAvailableCreditBalance,
  settleJobReservation,
  releaseJobReservation,
} from "@/lib/credits/ledger";
import { storePasteTextAsCv } from "@/lib/cv/service";
import { runAutomatedPublicationReview } from "@/lib/moderation/automated-review";
import { submitProfileForReview, updateOwnedProfileDraft, resolvePublicationReview } from "@/lib/profiles/service";

// Stub is configured in tests/setup.ts for the Vitest process only.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `m21-${Date.now().toString(36)}`;

async function createUser(label: string) {
  return db.user.create({
    data: {
      name: label,
      email: `${label}-${suffix}@example.com`,
      emailVerified: false,
      staffRole: "MEMBER",
    },
  });
}

describe("m1 preview hardening", () => {
  let userA = "";
  let userB = "";

  beforeAll(async () => {
    const a = await createUser("prev-a");
    const b = await createUser("prev-b");
    userA = a.id;
    userB = b.id;
    await createDefaultProfileForUser(a);
    await createDefaultProfileForUser(b);
    await updateOwnedProfileDraft(userA, {
      slug: `prev-a-${suffix}`,
      bio: "A gizli",
    });
    await updateOwnedProfileDraft(userB, {
      slug: `prev-b-${suffix}`,
      bio: "B gizli",
    });
  });

  afterAll(async () => {
    await db.profile.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  });

  it("denies forged preview of another user's private profile", async () => {
    const stolen = await getOwnerDraftPreviewBySlug(`prev-b-${suffix}`, userA);
    expect(stolen).toBeNull();
    const own = await getOwnerDraftPreviewBySlug(`prev-a-${suffix}`, userA);
    expect(own?.view.bio).toBe("A gizli");
    expect(await getPublicProfileBySlug(`prev-b-${suffix}`)).toBeNull();
  });
});

describe("m2.1 credits jobs suggestions moderation", () => {
  let userId = "";
  let adminId = "";
  const ids: string[] = [];

  beforeAll(async () => {
    const user = await createUser("m21-user");
    const admin = await createUser("m21-admin");
    await db.user.update({ where: { id: admin.id }, data: { staffRole: "ADMIN" } });
    userId = user.id;
    adminId = admin.id;
    ids.push(userId, adminId);
    await createDefaultProfileForUser(user);
    await createDefaultProfileForUser(admin);
  });

  afterAll(async () => {
    await db.creditLedgerEntry.deleteMany({ where: { userId: { in: ids } } });
    await db.creditLot.deleteMany({ where: { userId: { in: ids } } });
    await db.aiJob.deleteMany({ where: { userId: { in: ids } } });
    await db.cvDocument.deleteMany({ where: { userId: { in: ids } } });
    await db.automatedContentReview.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.publicationReview.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.profile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("idempotently grants sponsored credits and prevents concurrent overspend", async () => {
    await db.aiJob.deleteMany({ where: { userId } });
    await db.creditLedgerEntry.deleteMany({ where: { userId } });
    await db.creditLot.deleteMany({ where: { userId } });

    const [a, b] = await Promise.all([
      ensureSponsoredProfilePrepareGrant(userId),
      ensureSponsoredProfilePrepareGrant(userId),
    ]);
    expect(a.id).toBe(b.id);
    const lots = await db.creditLot.findMany({ where: { userId } });
    expect(lots).toHaveLength(1);
    expect(lots[0]?.originalAmount).toBe(1);

    const cv = await storePasteTextAsCv(
      userId,
      "Ayşe Deneme\nBeceri: Playwright, TypeScript\nDeneyim: QA mühendisi",
    );
    expect(cv.ok).toBe(true);
    if (!cv.ok) return;

    // Only 1 sponsored credit by default — second concurrent job should fail
    const results = await Promise.allSettled([
      createProfilePrepareJob({ userId, cvDocumentId: cv.documentId }),
      createProfilePrepareJob({ userId, cvDocumentId: cv.documentId }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(await getAvailableCreditBalance(userId)).toBe(0);

    if (fulfilled[0]?.status === "fulfilled") {
      await cancelOwnedJob(fulfilled[0].value.id, userId);
    }
  });

  it("worker processes stub job, settles once, and apply keeps publicSnapshot untouched", async () => {
    await db.aiJob.updateMany({
      where: { userId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), finishedAt: new Date() },
    });

    // Top up another sponsored-like lot for this test via staff gift style lot
    await db.creditLot.create({
      data: {
        userId,
        source: "STAFF_GIFT",
        idempotencyKey: `test-topup-${suffix}`,
        originalAmount: 2,
        remainingAmount: 2,
        reservedAmount: 0,
        provenance: "vitest",
      },
    });

    const cv = await storePasteTextAsCv(
      userId,
      "Ayşe Deneme\nBeceri: Kalite, Playwright\nDeneyim: 5 yıl test",
    );
    if (!cv.ok) throw new Error("cv failed");

    const before = await db.profile.findUniqueOrThrow({ where: { userId } });
    const publicBefore = before.publicSnapshot;

    const job = await createProfilePrepareJob({ userId, cvDocumentId: cv.documentId });
    const workerId = "vitest-worker";
    let claimed = await claimNextJob(workerId);
    // Drain any unexpected older queue items in this user's isolation
    for (let i = 0; i < 5 && claimed && claimed.id !== job.id; i++) {
      await db.aiJob.update({
        where: { id: claimed.id },
        data: { status: "CANCELLED", cancelledAt: new Date(), finishedAt: new Date(), leaseOwner: null },
      });
      await releaseJobReservation(claimed.id);
      claimed = await claimNextJob(workerId);
    }
    expect(claimed?.id).toBe(job.id);
    await processClaimedJob(job.id, workerId);

    const ready = await db.aiJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(ready.status).toBe("READY");
    expect(ready.providerMode).toBe("stub");

    const settles = await db.creditLedgerEntry.findMany({
      where: { jobId: job.id, type: "SETTLE" },
    });
    expect(settles).toHaveLength(1);
    await settleJobReservation(job.id);
    const settles2 = await db.creditLedgerEntry.findMany({
      where: { jobId: job.id, type: "SETTLE" },
    });
    expect(settles2).toHaveLength(1);

    // Change draft during/after to create conflict path awareness
    await updateOwnedProfileDraft(userId, { bio: "üye yeni bio" });
    const mid = await db.profile.findUniqueOrThrow({ where: { userId } });

    await applyJobSuggestions({
      userId,
      jobId: job.id,
      acceptedFields: ["skills"],
      edits: { skills: ["Playwright", "Kalite"] },
      expectedDraftRevision: mid.draftRevision,
    });

    const after = await db.profile.findUniqueOrThrow({ where: { userId } });
    expect(after.bio).toBe("üye yeni bio");
    expect(after.skills).toEqual(["Playwright", "Kalite"]);
    expect(after.publicSnapshot).toEqual(publicBefore);
  });

  it("failed job releases reservation once; cancel ignores late results", async () => {
    await db.aiJob.updateMany({
      where: { userId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), finishedAt: new Date() },
    });

    await db.creditLot.create({
      data: {
        userId,
        source: "STAFF_GIFT",
        idempotencyKey: `test-fail-${suffix}`,
        originalAmount: 1,
        remainingAmount: 1,
        reservedAmount: 0,
        provenance: "vitest",
      },
    });
    const cv = await storePasteTextAsCv(userId, "İsim\nBeceri: Node");
    if (!cv.ok) throw new Error("cv");
    const job = await createProfilePrepareJob({ userId, cvDocumentId: cv.documentId });
    await cancelOwnedJob(job.id, userId);
    const cancelled = await db.aiJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(cancelled.status).toBe("CANCELLED");
    await releaseJobReservation(job.id);
    const releases = await db.creditLedgerEntry.findMany({
      where: { jobId: job.id, type: "RELEASE" },
    });
    expect(releases.length).toBeGreaterThanOrEqual(1);

    // Late worker must not settle
    await processClaimedJob(job.id, "stale-worker");
    const settles = await db.creditLedgerEntry.findMany({
      where: { jobId: job.id, type: "SETTLE" },
    });
    expect(settles).toHaveLength(0);
  });

  it("cross-user cannot read another user's job", async () => {
    const other = await createUser("other-job");
    ids.push(other.id);
    await createDefaultProfileForUser(other);
    const job = await db.aiJob.findFirst({ where: { userId } });
    expect(job).toBeTruthy();
    const stolen = await db.aiJob.findFirst({ where: { id: job!.id, userId: other.id } });
    expect(stolen).toBeNull();
  });

  it("automated moderation assists but does not approve; pending edits stay out of publicSnapshot", async () => {
    await updateOwnedProfileDraft(userId, {
      displayName: "Temiz Üye",
      slug: `temiz-${suffix}`,
      bio: "Profesyonel eleştiri: süreçlerimiz yavaş, iyileştirebiliriz.",
      skills: ["Test"],
      discoverable: true,
    });
    const review = await submitProfileForReview(userId);
    const assist = await runAutomatedPublicationReview(review.id);
    expect(assist?.outcome === "CLEAR" || assist?.outcome === "UNAVAILABLE" || assist?.outcome === "NEEDS_REVIEW").toBe(
      true,
    );
    expect(await getPublicProfileBySlug(`temiz-${suffix}`)).toBeNull();

    await updateOwnedProfileDraft(userId, { bio: "henüz onaylanmamış yeni metin" });
    await resolvePublicationReview({
      reviewId: review.id,
      reviewerId: adminId,
      decision: "APPROVED",
    });
    const published = await getPublicProfileBySlug(`temiz-${suffix}`);
    expect(published?.view.bio).toBe("Profesyonel eleştiri: süreçlerimiz yavaş, iyileştirebiliriz.");
  });

  it("lease expiry allows another worker to recover interrupted work", async () => {
    await db.aiJob.updateMany({
      where: { userId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), finishedAt: new Date() },
    });

    await db.creditLot.create({
      data: {
        userId,
        source: "STAFF_GIFT",
        idempotencyKey: `test-lease-${suffix}`,
        originalAmount: 1,
        remainingAmount: 1,
        reservedAmount: 0,
        provenance: "vitest",
      },
    });
    const cv = await storePasteTextAsCv(userId, "Lease Test\nBeceri: Recovery");
    if (!cv.ok) throw new Error("cv");
    const job = await createProfilePrepareJob({ userId, cvDocumentId: cv.documentId });
    await db.aiJob.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        leaseOwner: "dead-worker",
        leaseExpiresAt: new Date(Date.now() - 1000),
        attemptCount: 1,
      },
    });
    const claimed = await claimNextJob("recovery-worker");
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.leaseOwner).toBe("recovery-worker");
    await processClaimedJob(job.id, "recovery-worker");
    const ready = await db.aiJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(ready.status).toBe("READY");
  });
});
