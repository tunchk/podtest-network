import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { bootstrapHostAuthorization } from "@/lib/arayanlar/bootstrap-host";
import { isAuthorizedHost } from "@/lib/arayanlar/host-auth";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const db = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);

describe("bootstrap host (ops)", () => {
  const ids: string[] = [];

  beforeAll(async () => {
    const admin = await db.user.create({
      data: {
        name: "boot-admin",
        email: `boot-admin-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "ADMIN",
      },
    });
    const member = await db.user.create({
      data: {
        name: "boot-member",
        email: `boot-member-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    ids.push(admin.id, member.id);
  });

  afterAll(async () => {
    await db.hostAuthorization.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("grants host for a verified user with ADMIN granter", async () => {
    const host = await db.user.create({
      data: {
        name: "boot-host-v",
        email: `boot-host-v-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    ids.push(host.id);

    const admin = await db.user.findFirstOrThrow({
      where: { email: `boot-admin-${suffix}@example.com` },
    });

    const result = await bootstrapHostAuthorization({
      targetEmail: host.email,
      granterEmail: admin.email,
    });

    expect(result.userId).toBe(host.id);
    expect(result.emailVerifiedMarked).toBe(false);
    expect(await isAuthorizedHost(host.id)).toBe(true);

    const fresh = await db.user.findUniqueOrThrow({ where: { id: host.id } });
    expect(fresh.staffRole).toBe("MEMBER");
  });

  it("rejects unverified host without --mark-email-verified", async () => {
    const host = await db.user.create({
      data: {
        name: "boot-host-u",
        email: `boot-host-u-${suffix}@example.com`,
        emailVerified: false,
        staffRole: "MEMBER",
      },
    });
    ids.push(host.id);

    const admin = await db.user.findFirstOrThrow({
      where: { email: `boot-admin-${suffix}@example.com` },
    });

    await expect(
      bootstrapHostAuthorization({
        targetEmail: host.email,
        granterEmail: admin.email,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

    expect(await isAuthorizedHost(host.id)).toBe(false);
  });

  it("marks email verified and grants host with trusted ops flag", async () => {
    const host = await db.user.create({
      data: {
        name: "boot-host-flag",
        email: `boot-host-flag-${suffix}@example.com`,
        emailVerified: false,
        staffRole: "MEMBER",
      },
    });
    ids.push(host.id);

    const admin = await db.user.findFirstOrThrow({
      where: { email: `boot-admin-${suffix}@example.com` },
    });

    const result = await bootstrapHostAuthorization({
      targetEmail: host.email,
      granterEmail: admin.email,
      markEmailVerified: true,
    });

    expect(result.emailVerifiedMarked).toBe(true);
    expect(await isAuthorizedHost(host.id)).toBe(true);

    const fresh = await db.user.findUniqueOrThrow({ where: { id: host.id } });
    expect(fresh.emailVerified).toBe(true);
    expect(fresh.staffRole).toBe("MEMBER");
  });

  it("rejects non-admin granter", async () => {
    const host = await db.user.create({
      data: {
        name: "boot-host-na",
        email: `boot-host-na-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    ids.push(host.id);

    const member = await db.user.findFirstOrThrow({
      where: { email: `boot-member-${suffix}@example.com` },
    });

    await expect(
      bootstrapHostAuthorization({
        targetEmail: host.email,
        granterEmail: member.email,
      }),
    ).rejects.toMatchObject({ code: "GRANTER_NOT_ADMIN" });

    expect(await isAuthorizedHost(host.id)).toBe(false);
  });

  it("duplicate grant remains idempotent", async () => {
    const host = await db.user.create({
      data: {
        name: "boot-host-idemp",
        email: `boot-host-idemp-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    ids.push(host.id);

    const admin = await db.user.findFirstOrThrow({
      where: { email: `boot-admin-${suffix}@example.com` },
    });

    const first = await bootstrapHostAuthorization({
      targetEmail: host.email,
      granterEmail: admin.email,
    });
    const second = await bootstrapHostAuthorization({
      targetEmail: host.email,
      granterEmail: admin.email,
    });

    expect(second.authorizationId).toBe(first.authorizationId);
    expect(second.alreadyAuthorized).toBe(true);

    const rows = await db.hostAuthorization.findMany({ where: { userId: host.id } });
    expect(rows).toHaveLength(1);
  });
});
