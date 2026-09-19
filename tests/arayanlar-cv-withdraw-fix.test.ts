import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDefaultProfileForUser } from "@/lib/profiles/service";
import { storePasteTextAsCv } from "@/lib/cv/service";
import {
  assignHost,
  confirmCostAndStart,
  getOrCreateApplication,
  toGuestApplicationView,
  withdrawApplication,
} from "@/lib/arayanlar/service";
import { grantHostAuthorization } from "@/lib/arayanlar/host-auth";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `kp-fix-${Date.now().toString(36)}`;

function readSrc(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Kariyer Portresi CV upload restoration", () => {
  it("guest flow wires shared CvUploadControl when no usable CV exists", () => {
    const src = readSrc("src/components/arayanlar/guest-flow.tsx");
    expect(src).toContain('from "@/components/cv-upload-control"');
    expect(src).toContain("<CvUploadControl");
    expect(src).toContain("cvDocs.length ?");
    // Upload is the else branch — not only select-when-present
    expect(src).toMatch(/cvDocs\.length \?[\s\S]*CvUploadControl/);
  });

  it("CvUploadControl reuses /api/cv and legal notices (no new CV system)", () => {
    const src = readSrc("src/components/cv-upload-control.tsx");
    expect(src).toContain('fetch("/api/cv"');
    expect(src).toContain("cvNoticeAck");
    expect(src).toContain("LEGAL_COPY");
    expect(src).not.toContain("/api/ai/profile-prepare");
    expect(src).not.toContain("ARAYANLAR_PREPARE");
  });
});

describe("Kariyer Portresi withdraw + assignedHostUserId", () => {
  let guestId = "";
  let hostId = "";
  let adminId = "";

  beforeAll(async () => {
    const guest = await db.user.create({
      data: {
        name: "KP Guest",
        email: `kp-guest-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const host = await db.user.create({
      data: {
        name: "KP Host",
        email: `kp-host-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const admin = await db.user.create({
      data: {
        name: "KP Admin",
        email: `kp-admin-${suffix}@example.com`,
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
      provenance: "kp-fix",
    });
  });

  afterAll(async () => {
    await db.aiJob.deleteMany({ where: { userId: guestId } });
    await db.arayanlarArtifact.deleteMany({
      where: { application: { userId: guestId } },
    });
    await db.arayanlarApplication.deleteMany({ where: { userId: guestId } });
    await db.hostAuthorization.deleteMany({ where: { userId: hostId } });
    await db.cvDocument.deleteMany({ where: { userId: guestId } });
    await db.inAppNotification.deleteMany({
      where: { userId: { in: [guestId, hostId] } },
    });
    await db.profile.deleteMany({ where: { userId: { in: [guestId, hostId, adminId] } } });
    await db.user.deleteMany({ where: { id: { in: [guestId, hostId, adminId] } } });
    await db.$disconnect();
  });

  it("generated Prisma client accepts assignedHostUserId writes", async () => {
    const app = await getOrCreateApplication(guestId);
    const updated = await db.arayanlarApplication.update({
      where: { id: app.id },
      data: {
        assignedHostUserId: hostId,
        assignedAt: new Date(),
        assignedByUserId: adminId,
      },
    });
    expect(updated.assignedHostUserId).toBe(hostId);
  });

  it("withdraw clears host assignment and schedule fields without deleting CV", async () => {
    const cv = await storePasteTextAsCv(
      guestId,
      "Senior QA engineer with Playwright experience across product teams.",
    );
    expect(cv.ok).toBe(true);

    await confirmCostAndStart(guestId);
    const appRow = await db.arayanlarApplication.findUniqueOrThrow({
      where: { userId: guestId },
    });
    await assignHost({
      applicationId: appRow.id,
      hostUserId: hostId,
      assignedByUserId: adminId,
    });

    await db.arayanlarApplication.update({
      where: { userId: guestId },
      data: {
        recordingScheduledAt: new Date(),
        recordingTimezone: "Europe/Istanbul",
        recordingMeetingUrl: "https://meet.example.com/x",
        recordingSchedulingNote: "test",
        recordingScheduledByUserId: hostId,
        publicationReviewRequestedAt: new Date(),
        publicationReviewVersionId: "ver-test",
        publicationChangeRequestNote: "note",
        publicationChangeRequestedAt: new Date(),
      },
    });

    const withdrawn = await withdrawApplication(guestId);
    expect(withdrawn.status).toBe("WITHDRAWN");
    expect(withdrawn.assignedHostUserId).toBeNull();
    expect(withdrawn.assignedAt).toBeNull();
    expect(withdrawn.assignedByUserId).toBeNull();
    expect(withdrawn.recordingScheduledAt).toBeNull();
    expect(withdrawn.recordingMeetingUrl).toBeNull();
    expect(withdrawn.publicationReviewRequestedAt).toBeNull();
    expect(withdrawn.publicationReviewVersionId).toBeNull();

    const cvStillThere = await db.cvDocument.count({
      where: { userId: guestId, deletedAt: null },
    });
    expect(cvStillThere).toBeGreaterThan(0);

    const guestView = toGuestApplicationView(withdrawn);
    expect(JSON.stringify(guestView)).not.toContain("Senior QA");
    expect(JSON.stringify(guestView)).not.toContain("Playwright");
  });

  it("withdraw confirmation UI remains explicit (two-step)", () => {
    const src = readSrc("src/components/arayanlar/guest-flow.tsx");
    expect(src).toContain("withdrawOpen");
    expect(src).toContain("Başvurunu geri çekmek istiyor musun?");
    expect(src).toContain('action: "withdraw"');
  });
});
