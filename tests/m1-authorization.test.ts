import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  createDefaultProfileForUser,
  getPublicProfileBySlug,
  listDirectoryProfiles,
  submitProfileForReview,
  resolvePublicationReview,
  unpublishProfile,
  updateOwnedProfileDraft,
  isPubliclyVisible,
} from "@/lib/profiles/service";
import { evaluateUserCapability, seedDevCapabilityGrant } from "@/lib/capabilities/evaluate";
import { catchylabsIntegration } from "@/lib/integrations/catchylabs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const db = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);

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

describe("milestone 1 privacy and authorization", () => {
  let userAId = "";
  let userBId = "";
  let adminId = "";

  beforeAll(async () => {
    const userA = await createUser("user-a");
    const userB = await createUser("user-b");
    const admin = await createUser("admin");
    await db.user.update({ where: { id: admin.id }, data: { staffRole: "ADMIN" } });

    userAId = userA.id;
    userBId = userB.id;
    adminId = admin.id;

    await createDefaultProfileForUser(userA);
    await createDefaultProfileForUser(userB);
    await createDefaultProfileForUser(admin);
  });

  afterAll(async () => {
    await db.publicationReview.deleteMany({
      where: { profile: { userId: { in: [userAId, userBId, adminId] } } },
    });
    await db.capabilityGrant.deleteMany({
      where: { userId: { in: [userAId, userBId, adminId] } },
    });
    await db.profile.deleteMany({ where: { userId: { in: [userAId, userBId, adminId] } } });
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId, adminId] } } });
    await db.$disconnect();
  });

  it("lets a member keep a private draft that is not in the directory", async () => {
    await updateOwnedProfileDraft(userAId, {
      displayName: "Ayşe Taslak",
      slug: `ayse-taslak-${suffix}`,
      bio: "gizli biyografi",
      skills: ["Playwright"],
      openToWork: true,
    });

    const listed = await listDirectoryProfiles({ page: 1, pageSize: 50, skill: "Playwright" });
    expect(listed.items.find((item) => item.slug === `ayse-taslak-${suffix}`)).toBeUndefined();

    const publicView = await getPublicProfileBySlug(`ayse-taslak-${suffix}`);
    expect(publicView).toBeNull();
  });

  it("user B cannot update user A draft by owning only their own profile row", async () => {
    const before = await db.profile.findUniqueOrThrow({ where: { userId: userAId } });
    await updateOwnedProfileDraft(userBId, {
      displayName: "Bertan",
      bio: "B'nin bio",
    });
    const afterA = await db.profile.findUniqueOrThrow({ where: { userId: userAId } });
    expect(afterA.bio).toBe(before.bio);
    expect(afterA.displayName).toBe(before.displayName);
  });

  it("keeps pending edits out of public output until approval", async () => {
    await updateOwnedProfileDraft(userAId, {
      displayName: "Ayşe Bekleyen",
      slug: `ayse-public-${suffix}`,
      bio: "inceleme bekleyen metin",
      skills: ["Kalite"],
      discoverable: true,
      openToWork: true,
    });

    await submitProfileForReview(userAId);
    expect(await getPublicProfileBySlug(`ayse-public-${suffix}`)).toBeNull();

    const pending = await db.publicationReview.findFirst({
      where: { profile: { userId: userAId }, status: "PENDING" },
    });
    expect(pending).toBeTruthy();

    await resolvePublicationReview({
      reviewId: pending!.id,
      reviewerId: adminId,
      decision: "APPROVED",
    });

    const published = await getPublicProfileBySlug(`ayse-public-${suffix}`);
    expect(published?.view.displayName).toBe("Ayşe Bekleyen");
    expect(published?.view.bio).toBe("inceleme bekleyen metin");

    await updateOwnedProfileDraft(userAId, {
      bio: "henüz onaylanmamış yeni bio",
    });

    const stillOld = await getPublicProfileBySlug(`ayse-public-${suffix}`);
    expect(stillOld?.view.bio).toBe("inceleme bekleyen metin");

    const dir = await listDirectoryProfiles({ page: 1, pageSize: 50, skill: "Kalite" });
    expect(dir.items.some((item) => item.slug === `ayse-public-${suffix}`)).toBe(true);
  });

  it("unpublishes immediately and removes from discovery", async () => {
    await unpublishProfile(userAId);
    const profile = await db.profile.findUniqueOrThrow({ where: { userId: userAId } });
    expect(isPubliclyVisible(profile)).toBe(false);
    expect(await getPublicProfileBySlug(`ayse-public-${suffix}`)).toBeNull();

    const dir = await listDirectoryProfiles({ page: 1, pageSize: 50, skill: "Kalite" });
    expect(dir.items.some((item) => item.slug === `ayse-public-${suffix}`)).toBe(false);
  });

  it("HIRING status does not grant admin or paid capabilities", async () => {
    await updateOwnedProfileDraft(userBId, { hiring: true });
    const userB = await db.user.findUniqueOrThrow({ where: { id: userBId } });
    expect(userB.staffRole).toBe("MEMBER");

    const advanced = await evaluateUserCapability(userBId, "hiring.search.advanced");
    expect(advanced.allowed).toBe(false);
  });

  it("capability checks reject unknown features server-side", async () => {
    const result = await evaluateUserCapability(userAId, "totally.unknown.feature");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("unknown_capability");
  });

  it("dev seed grant enables a capability with provenance", async () => {
    await seedDevCapabilityGrant({
      userId: userAId,
      capabilityKey: "ai.profile.prepare",
      provenance: "vitest-m1",
    });
    const result = await evaluateUserCapability(userAId, "ai.profile.prepare");
    expect(result.allowed).toBe(true);
    expect(result.source).toBe("DEV_SEED");
  });

  it("Catchylabs integration stays unavailable when unconfigured", async () => {
    const status = await catchylabsIntegration.getAccessStatus(userAId);
    expect(status.status).toBe("not_configured");
  });
});
