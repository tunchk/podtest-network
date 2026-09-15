import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  getOrCreateApplication,
  postConversationMessage,
  withdrawApplication,
  assignHost,
  getHostPackForAssignedHost,
} from "@/lib/arayanlar/service";
import { grantHostAuthorization } from "@/lib/arayanlar/host-auth";
import { assertArayanlarChatLimits, releaseArayanlarChatSlot } from "@/lib/arayanlar/rate-limit";
import { MAX_PREPARATION_QUESTIONS } from "@/lib/arayanlar/constants";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `m22f-${Date.now().toString(36)}`;

describe("m2.2 follow-up limits and host revoke", () => {
  let guestId = "";
  let hostId = "";
  let otherHostId = "";
  let adminId = "";

  beforeAll(async () => {
    const guest = await db.user.create({
      data: { name: "g", email: `g-${suffix}@example.com`, emailVerified: true, staffRole: "MEMBER" },
    });
    const host = await db.user.create({
      data: { name: "h", email: `h-${suffix}@example.com`, emailVerified: true, staffRole: "MEMBER" },
    });
    const other = await db.user.create({
      data: { name: "o", email: `o-${suffix}@example.com`, emailVerified: true, staffRole: "MEMBER" },
    });
    const admin = await db.user.create({
      data: { name: "a", email: `a-${suffix}@example.com`, emailVerified: true, staffRole: "ADMIN" },
    });
    guestId = guest.id;
    hostId = host.id;
    otherHostId = other.id;
    adminId = admin.id;
    await grantHostAuthorization({ userId: hostId, grantedByUserId: adminId, provenance: "t" });
    await grantHostAuthorization({ userId: otherHostId, grantedByUserId: adminId, provenance: "t" });
  });

  afterAll(async () => {
    await db.arayanlarArtifact.deleteMany({ where: { application: { userId: guestId } } });
    await db.aiJob.deleteMany({ where: { userId: { in: [guestId, hostId] } } });
    await db.arayanlarApplication.deleteMany({ where: { userId: guestId } });
    await db.hostAuthorization.deleteMany({
      where: { userId: { in: [hostId, otherHostId] } },
    });
    await db.user.deleteMany({ where: { id: { in: [guestId, hostId, otherHostId, adminId] } } });
    await db.$disconnect();
  });

  it("enforces chat input/concurrency limits", () => {
    expect(() => assertArayanlarChatLimits(guestId, 50)).not.toThrow();
    releaseArayanlarChatSlot(guestId);
    expect(() => assertArayanlarChatLimits(guestId, 50_000)).toThrow();
  });

  it("does not reset question budget on resume", async () => {
    const app = await getOrCreateApplication(guestId);
    await db.arayanlarApplication.update({
      where: { id: app.id },
      data: { questionsAsked: MAX_PREPARATION_QUESTIONS },
    });
    const again = await getOrCreateApplication(guestId);
    expect(again.questionsAsked).toBe(MAX_PREPARATION_QUESTIONS);

    // Further chat should complete without resetting counter downward
    await postConversationMessage({ userId: guestId, message: "x", skip: true }).catch(() => undefined);
    const after = await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: guestId } });
    expect(after.questionsAsked).toBeGreaterThanOrEqual(MAX_PREPARATION_QUESTIONS);
  });

  it("withdraw and reassignment revoke host access", async () => {
    const app = await getOrCreateApplication(guestId);
    await db.arayanlarApplication.update({
      where: { id: app.id },
      data: {
        status: "SUBMITTED",
        prepStatus: "READY",
        submittedRevision: 1,
        submittedFacts: {
          displayName: "g",
          targetRole: "x",
          storyTopic: "y",
          contribution: "z",
          workPreferences: "w",
          excludedTopics: "",
          contactChannel: "p",
          profileHintsUsed: [],
        },
      },
    });
    await db.arayanlarArtifact.create({
      data: {
        applicationId: app.id,
        kind: "HOST_PACK",
        submittedRevision: 1,
        editorialTemplateVersion: "arayanlar-18m-v1",
        generatedJson: {
          factualIntroduction: { text: "t", sourceLabels: ["member_confirmed"], uncertaintyLabels: [] },
          mainQuestions: [
            { question: "q1", followUps: [] },
            { question: "q2", followUps: [] },
            { question: "q3", followUps: [] },
          ],
          case: {
            title: "c",
            setup: "s",
            supportingFacts: ["a", "b"],
            newFact: "n",
          },
          rapidRound: {
            questions: ["1", "2", "3", "4", "5"],
            alternatives: ["a1", "a2"],
          },
          timingAndTransitions: [
            { start: "00:00", end: "00:20", label: "x", hostNote: "n" },
          ],
          unresolvedDetails: [],
          excludedTopics: [],
          approvedContactChannel: "p",
          coldOpenProductionNote: "n",
          editorialNotes: [],
        },
      },
    });

    await assignHost({ applicationId: app.id, hostUserId: hostId, assignedByUserId: adminId });
    const ok = await getHostPackForAssignedHost({ hostUserId: hostId, applicationId: app.id });
    expect(ok.ok).toBe(true);

    await assignHost({ applicationId: app.id, hostUserId: otherHostId, assignedByUserId: adminId });
    const revoked = await getHostPackForAssignedHost({ hostUserId: hostId, applicationId: app.id });
    expect(revoked.ok).toBe(false);

    await assignHost({ applicationId: app.id, hostUserId: hostId, assignedByUserId: adminId });
    await withdrawApplication(guestId);
    const afterWithdraw = await getHostPackForAssignedHost({
      hostUserId: hostId,
      applicationId: app.id,
    });
    expect(afterWithdraw.ok).toBe(false);
  });
});
