import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  createNotification,
  listNotifications,
  markAllRead,
  markRead,
  resolveNotificationDestination,
  unreadCount,
} from "@/lib/notifications/service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `notif-${Date.now().toString(36)}`;

async function createUser(label: string) {
  return db.user.create({
    data: {
      name: label,
      email: `${label}-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "MEMBER",
    },
  });
}

describe("in-app notifications", () => {
  let owner = "";
  let stranger = "";
  const ids: string[] = [];

  beforeAll(async () => {
    const a = await createUser("notif-a");
    const b = await createUser("notif-b");
    owner = a.id;
    stranger = b.id;
    ids.push(owner, stranger);
  });

  afterAll(async () => {
    await db.inAppNotification.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("isolates listing and unread count to the recipient", async () => {
    await createNotification({
      userId: owner,
      kind: "message_request",
      title: "Yeni mesaj isteği",
      body: "Bir üye sana mesaj isteği gönderdi.",
      href: "/mesajlar",
      dedupeKey: `test:message_request:${suffix}:1`,
      payload: { requestId: "req-test-1" },
    });
    await createNotification({
      userId: stranger,
      kind: "message_request",
      title: "Yeni mesaj isteği",
      body: "Bir üye sana mesaj isteği gönderdi.",
      href: "/mesajlar",
      dedupeKey: `test:message_request:${suffix}:stranger`,
      payload: { requestId: "req-test-stranger" },
    });

    const listed = await listNotifications(owner, { take: 20 });
    expect(listed.items.every((n) => n.userId === owner)).toBe(true);
    expect(listed.items.some((n) => n.userId === stranger)).toBe(false);

    const ownerUnread = await unreadCount(owner);
    const strangerUnread = await unreadCount(stranger);
    expect(ownerUnread).toBeGreaterThanOrEqual(1);
    expect(strangerUnread).toBeGreaterThanOrEqual(1);
    expect(ownerUnread).not.toBe(strangerUnread + 1000);
  });

  it("marks read only for the recipient", async () => {
    const created = await createNotification({
      userId: owner,
      kind: "profile_review_approved",
      title: "Profilin yayına alındı",
      href: "/hesabim/profil",
      dedupeKey: `test:profile:${suffix}`,
    });

    await expect(
      markRead({ userId: stranger, notificationId: created.notification.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const marked = await markRead({
      userId: owner,
      notificationId: created.notification.id,
    });
    expect(marked.readAt).toBeTruthy();

    const again = await markAllRead(owner);
    expect(again.updated).toBeGreaterThanOrEqual(0);
  });

  it("dedupes by userId + dedupeKey", async () => {
    const key = `test:dedupe:${suffix}`;
    const first = await createNotification({
      userId: owner,
      kind: "arayanlar_prep_ready",
      title: "Arayanlar hazırlığın hazır",
      href: "/arayanlar/hazirligim",
      dedupeKey: key,
    });
    expect(first.created).toBe(true);

    const second = await createNotification({
      userId: owner,
      kind: "arayanlar_prep_ready",
      title: "Arayanlar hazırlığın hazır",
      href: "/arayanlar/hazirligim",
      dedupeKey: key,
    });
    expect(second.created).toBe(false);
    expect(second.notification.id).toBe(first.notification.id);

    const count = await db.inAppNotification.count({
      where: { userId: owner, dedupeKey: key },
    });
    expect(count).toBe(1);
  });

  it("denies destination resolution for a foreign viewer", async () => {
    const created = await createNotification({
      userId: owner,
      kind: "job_listing_published",
      title: "İş ilanı yayımlandı",
      href: "/isveren/ilanlar",
      dedupeKey: `test:job:${suffix}`,
      payload: { workspaceId: "ws-missing", jobId: "job-missing" },
    });

    const denied = await resolveNotificationDestination(created.notification, stranger);
    expect(denied.available).toBe(false);
    if (!denied.available) {
      expect(denied.reason).toMatch(/erişim/i);
    }

    const ownerDest = await resolveNotificationDestination(created.notification, owner);
    // Workspace membership missing → honest unavailable, not a foreign leak.
    expect(ownerDest.available).toBe(false);
  });
});
