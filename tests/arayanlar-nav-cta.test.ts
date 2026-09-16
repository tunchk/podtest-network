import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { withdrawApplication } from "@/lib/arayanlar/service";

const root = path.resolve(__dirname, "..");

function readSrc(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Kariyer Portresi navigation CTAs must not withdraw", () => {
  it("hazirligim Başvuruma dön is a Link to /arayanlar/basvurum only", () => {
    const src = readSrc("src/app/arayanlar/hazirligim/page.tsx");
    expect(src).toMatch(
      /<Link href=["']\/arayanlar\/basvurum["'][^>]*>\s*Başvuruma dön\s*<\/Link>/,
    );
    // The back CTA must not target the guest-flow root (which hosts withdrawal).
    expect(src).not.toMatch(
      /<Link href=["']\/arayanlar["'][^>]*>\s*Başvuruma dön\s*<\/Link>/,
    );
    expect(src).not.toMatch(/action:\s*["']withdraw["']/);
    expect(src).not.toMatch(/withdrawApplication|withdrawOpen|geri çek/);
    expect(src).not.toMatch(/<form[\s>]/);
    expect(src).toMatch(/import Link from ["']next\/link["']/);
  });

  it("guest-flow Başvuruma dön links are pure navigation Links", () => {
    const src = readSrc("src/components/arayanlar/guest-flow.tsx");
    const linkMatches = [
      ...src.matchAll(
        /<Link href="(\/arayanlar\/basvurum)"[^>]*>\s*Başvuruma dön\s*<\/Link>/g,
      ),
    ];
    expect(linkMatches.length).toBeGreaterThanOrEqual(2);
    // Withdrawal is a separate button + confirmation dialog, not the nav CTA.
    expect(src).toMatch(/onClick=\{\(\) => setWithdrawOpen\(true\)\}/);
    expect(src).toMatch(/onClick=\{\(\) => void withdraw\(\)\}/);
    expect(src).toMatch(/Vazgeç/);
    // No untyped buttons in this file (default submit hazard).
    expect(src.match(/<button(?![^>]*type=)[^>]*>/g) ?? []).toHaveLength(0);
    expect(src.includes("<form")).toBe(false);
  });

  it("non-destructive CTAs are not wired to withdraw action", () => {
    const src = readSrc("src/components/arayanlar/guest-flow.tsx");
    for (const label of [
      "Notlarımı aç",
      "Başvuruma dön",
      "Şimdi kontrol et",
      "Bilgilerime dön",
      "Ücretsiz yeniden dene",
      "Vazgeç",
    ]) {
      expect(src).toContain(label);
    }
    // Only the confirm button in the dialog may call withdraw().
    const withdrawCalls = [...src.matchAll(/void withdraw\(\)/g)];
    expect(withdrawCalls).toHaveLength(1);
    expect(src).toMatch(/action:\s*["']withdraw["']/);
  });
});

describe("withdrawal remains explicit and confirmed", () => {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!,
  });
  const db = new PrismaClient({ adapter });
  const suffix = Date.now().toString(36);
  let userId = "";
  let applicationId = "";

  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        name: "Nav CTA Guest",
        email: `nav-cta-${suffix}@example.com`,
        emailVerified: false,
        staffRole: "MEMBER",
      },
    });
    userId = user.id;
    const app = await db.arayanlarApplication.create({
      data: {
        userId,
        status: "SUBMITTED",
        prepStatus: "READY",
        submittedRevision: 1,
        editorialTemplateVersion: "kariyer-portresi-producer-v1",
        submittedFacts: {
          displayName: "Nav",
          targetRole: "QA",
          storyTopic: "x",
          contribution: "y",
          workPreferences: "",
          excludedTopics: "",
          contactChannel: "platform",
          profileHintsUsed: [],
        },
        draftAnswers: {},
        conversationTurns: [],
        questionsAsked: 0,
        confirmedCostAt: new Date(),
        submittedAt: new Date(),
      },
    });
    applicationId = app.id;
  });

  afterAll(async () => {
    await db.inAppNotification.deleteMany({ where: { userId } });
    await db.arayanlarApplication.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("READY application stays SUBMITTED without an explicit withdraw call", async () => {
    const before = await db.arayanlarApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
    expect(before.status).toBe("SUBMITTED");
    expect(before.prepStatus).toBe("READY");

    // Simulate "Başvuruma dön" / hazirligim navigation: read-only reconciliation path only.
    const { reconcileArayanlarPrepStatusFromJob, getGuestBriefForMember } = await import(
      "@/lib/arayanlar/service"
    );
    await reconcileArayanlarPrepStatusFromJob(userId);
    await getGuestBriefForMember(userId);

    const after = await db.arayanlarApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
    expect(after.status).toBe("SUBMITTED");
    expect(after.prepStatus).toBe("READY");
    expect(after.withdrawnAt).toBeNull();

    const withdrawnNotifs = await db.inAppNotification.findMany({
      where: { userId, kind: "arayanlar_application_withdrawn" },
    });
    expect(withdrawnNotifs).toHaveLength(0);
  });

  it("explicit withdraw mutates once and emits one notification", async () => {
    await withdrawApplication(userId);
    // Idempotent second call must not create another notification row for same revision.
    await withdrawApplication(userId);

    const app = await db.arayanlarApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
    expect(app.status).toBe("WITHDRAWN");
    expect(app.withdrawnAt).not.toBeNull();

    const withdrawnNotifs = await db.inAppNotification.findMany({
      where: { userId, kind: "arayanlar_application_withdrawn" },
    });
    expect(withdrawnNotifs).toHaveLength(1);
  });
});
