import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  ARAYANLAR_NOTIF,
  notifyArayanlarApplicationSubmitted,
  notifyArayanlarApplicationWithdrawn,
  notifyArayanlarPrepFailedRetryable,
  notifyArayanlarPrepReady,
} from "@/lib/arayanlar/notifications";
import { createNotification } from "@/lib/notifications/service";
import { ui } from "@/lib/ui-copy";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `arayn-n-${Date.now().toString(36)}`;

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

describe("Kariyer Portresi milestone notifications", () => {
  let userId = "";
  const applicationId = `app-${suffix}`;
  const ids: string[] = [];

  beforeAll(async () => {
    const user = await createUser("arayn-n");
    userId = user.id;
    ids.push(userId);
  });

  afterAll(async () => {
    await db.inAppNotification.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("creates application submitted once per revision", async () => {
    const first = await notifyArayanlarApplicationSubmitted({
      userId,
      applicationId,
      revision: 1,
    });
    expect(first.created).toBe(true);
    expect(first.notification.title).toBe("Başvurun alındı");
    expect(first.notification.href).toBe("/arayanlar/basvurum");
    expect(first.notification.body).toMatch(/Kariyer Portresi/);
    expect(first.notification.kind).toBe(ARAYANLAR_NOTIF.submitted);

    const second = await notifyArayanlarApplicationSubmitted({
      userId,
      applicationId,
      revision: 1,
    });
    expect(second.created).toBe(false);
    expect(second.notification.id).toBe(first.notification.id);

    const nextRev = await notifyArayanlarApplicationSubmitted({
      userId,
      applicationId,
      revision: 2,
    });
    expect(nextRev.created).toBe(true);
    expect(nextRev.notification.id).not.toBe(first.notification.id);
  });

  it("creates READY once with updated Turkish copy", async () => {
    const first = await notifyArayanlarPrepReady({
      userId,
      applicationId,
      revision: 1,
    });
    expect(first.created).toBe(true);
    expect(first.notification.title).toBe("Kayıt öncesi notların hazır");
    expect(first.notification.href).toBe("/arayanlar/hazirligim");
    expect(first.notification.body).toBe(
      "Kariyer Portresi kaydın için hazırlanan notları şimdi inceleyebilirsin.",
    );
    expect(first.notification.kind).toBe(ARAYANLAR_NOTIF.prepReady);
    expect(first.notification.title).not.toMatch(/Hazırlığın hazır/);

    const second = await notifyArayanlarPrepReady({
      userId,
      applicationId,
      revision: 1,
    });
    expect(second.created).toBe(false);

    // Simulated polling/GET must not invent another notify path — calling helper again still dedupes.
    const polled = await notifyArayanlarPrepReady({
      userId,
      applicationId,
      revision: 1,
    });
    expect(polled.created).toBe(false);

    const count = await db.inAppNotification.count({
      where: {
        userId,
        kind: ARAYANLAR_NOTIF.prepReady,
        dedupeKey: `${ARAYANLAR_NOTIF.prepReady}:${applicationId}:r1`,
      },
    });
    expect(count).toBe(1);

    const rev2 = await notifyArayanlarPrepReady({
      userId,
      applicationId,
      revision: 2,
    });
    expect(rev2.created).toBe(true);
  });

  it("does not create notifications for QUEUED/RUNNING kinds", async () => {
    const before = await db.inAppNotification.count({ where: { userId } });
    // Explicitly assert we never emit these kinds from the milestone helpers.
    const kinds = await db.inAppNotification.findMany({
      where: { userId },
      select: { kind: true },
    });
    expect(kinds.every((k) => !k.kind.includes("queued") && !k.kind.includes("running"))).toBe(
      true,
    );
    expect(before).toBeGreaterThan(0);
  });

  it("creates actionable retryable failure once; skips terminal", async () => {
    const first = await notifyArayanlarPrepFailedRetryable({
      userId,
      applicationId,
      revision: 3,
      attemptCount: 1,
      maxAttempts: 3,
    });
    expect(first.created).toBe(true);
    if (!first.created || !("notification" in first) || !first.notification) {
      throw new Error("expected retryable failure notification");
    }
    expect(first.notification.title).toBe("Kayıt öncesi notlar oluşturulamadı");
    expect(first.notification.href).toBe("/arayanlar/basvurum");

    const again = await notifyArayanlarPrepFailedRetryable({
      userId,
      applicationId,
      revision: 3,
      attemptCount: 2,
      maxAttempts: 3,
    });
    expect(again.created).toBe(false);

    const terminal = await notifyArayanlarPrepFailedRetryable({
      userId,
      applicationId,
      revision: 4,
      attemptCount: 3,
      maxAttempts: 3,
    });
    expect(terminal.created).toBe(false);
    expect(terminal.skipped).toBe("terminal");
    const terminalCount = await db.inAppNotification.count({
      where: {
        userId,
        kind: ARAYANLAR_NOTIF.prepFailedRetryable,
        dedupeKey: `${ARAYANLAR_NOTIF.prepFailedRetryable}:${applicationId}:r4`,
      },
    });
    expect(terminalCount).toBe(0);
  });

  it("creates withdrawal once per revision", async () => {
    const first = await notifyArayanlarApplicationWithdrawn({
      userId,
      applicationId,
      revision: 1,
    });
    expect(first.created).toBe(true);
    expect(first.notification.title).toBe("Başvurun geri çekildi");
    expect(first.notification.body).toBe("Kariyer Portresi başvurun geri çekildi.");
    expect(first.notification.href).toBe("/arayanlar");

    const second = await notifyArayanlarApplicationWithdrawn({
      userId,
      applicationId,
      revision: 1,
    });
    expect(second.created).toBe(false);
  });

  it("keeps product naming Kariyer Portresi in UI copy", () => {
    expect(ui.nav.arayanlar).toBe("Kariyer Portresi");
    expect(ui.arayanlar.title).toBe("Kariyer Portresi");
    expect(ui.arayanlar.viewPrep).toBe("Notlarımı aç");
    expect(ui.landing.ctaArayanlar).toMatch(/Kariyer Portresi/);
  });

  it("never stores technical jargon in milestone notification copy", async () => {
    const rows = await db.inAppNotification.findMany({
      where: {
        userId,
        kind: {
          in: [
            ARAYANLAR_NOTIF.submitted,
            ARAYANLAR_NOTIF.prepReady,
            ARAYANLAR_NOTIF.prepFailedRetryable,
            ARAYANLAR_NOTIF.withdrawn,
          ],
        },
      },
    });
    for (const row of rows) {
      const blob = `${row.title} ${row.body ?? ""}`;
      expect(blob).not.toMatch(/queued|running|job|ledger|RESERVE|package|attempt|QUEUED|RUNNING/i);
    }
  });

  it("createNotification without milestone helpers still dedupes (infra sanity)", async () => {
    const key = `manual:${suffix}`;
    const a = await createNotification({
      userId,
      kind: ARAYANLAR_NOTIF.prepReady,
      title: "Kayıt öncesi notların hazır",
      href: "/arayanlar/hazirligim",
      dedupeKey: key,
    });
    const b = await createNotification({
      userId,
      kind: ARAYANLAR_NOTIF.prepReady,
      title: "Kayıt öncesi notların hazır",
      href: "/arayanlar/hazirligim",
      dedupeKey: key,
    });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
  });
});
