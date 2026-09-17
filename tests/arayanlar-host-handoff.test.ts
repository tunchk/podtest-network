import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { grantHostAuthorization } from "@/lib/arayanlar/host-auth";
import { sendKariyerPortresiHostHandoff } from "@/lib/arayanlar/host-handoff";
import {
  hostHandoffIdempotencyKey,
  hostPrepNotesPath,
  resolveDefaultKariyerPortresiHost,
} from "@/lib/arayanlar/default-host";
import { getHostPackForAssignedHost } from "@/lib/arayanlar/service";
import {
  FIXED_CLOSING_QUESTION,
  PREPARATION_SCHEMA_VERSION,
  arayanlarPrepareOutputSchema,
} from "@/lib/arayanlar/artifact-schema";

const root = path.resolve(__dirname, "..");
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!,
});
const db = new PrismaClient({ adapter });
const suffix = `handoff-${Date.now().toString(36)}`;

function sampleOutput() {
  return arayanlarPrepareOutputSchema.parse({
    schemaVersion: PREPARATION_SCHEMA_VERSION,
    preparation: {
      identityPrep: {
        profileSignals: ["QA Lead hedefi", "Wallet kalite", "Koçluk sinyali"],
        careerThemes: ["domain kalite"],
        careerTransitions: ["uygulamadan stratejiye"],
        confirmedFacts: ["Hedef: QA Lead"],
        missingInformation: ["Metrik yok"],
        guestPrepQuestions: ["Kimliğini nasıl anlatırsın?"],
        hostQuestions: ["Bugün hangi rolle konuşuyorsun?"],
      },
      storyCandidates: [
        {
          title: "Wallet kalite",
          sourceExperience: "Wallet / QA",
          whyThisCouldBeAStory: "Trade-off potansiyeli",
          knownFacts: ["Wallet domain"],
          missingDetails: ["Sonuç metrikleri yok"],
          guestPrepQuestions: ["Ne değişti?"],
          hostQuestions: ["Zorluk neydi?"],
          followUpQuestions: ["Kararın neydi?"],
          sourceReferences: ["facts.storyTopic"],
        },
      ],
      thinkingScenario: {
        scenario: "Regresyon artıyor, metrik eksik.",
        whyItFitsThisCandidate: "QA Lead bağlamı",
        whatTheHostShouldListenFor: ["Netleştirme", "Risk"],
        constraints: ["Zaman baskısı"],
      },
      jobSearchPrep: {
        knownPreferences: ["hibrit"],
        inferredButUnconfirmed: ["yönetim ilgisi olabilir"],
        missingInformation: ["hedef unvan net değil"],
        guestPrepQuestions: ["Ne arıyorsun?"],
        hostQuestions: ["Takım tipi?"],
      },
      rapidFire: [
        { question: "Wallet’ta hangi kalite sinyali?", whyThisQuestionFits: "CV’de Wallet" },
        { question: "Koçlukta ne ölçtün?", whyThisQuestionFits: "koçluk sinyali" },
        { question: "Araç mı süreç mi?", whyThisQuestionFits: "strateji yönü" },
        { question: "Consulting farkı?", whyThisQuestionFits: "deneyim kombinasyonu" },
        { question: "Otomasyon sınırı?", whyThisQuestionFits: "QA bağlamı" },
      ],
      closingPrep: {
        fixedQuestion: FIXED_CLOSING_QUESTION,
        guestReflectionPrompts: ["Kısa düşün", "Somut örnek"],
      },
      overallMissingInformation: ["Metrik yok"],
    },
  });
}

describe("Kariyer Portresi host handoff (v1)", () => {
  let guestId = "";
  let hostId = "";
  let adminId = "";
  let applicationId = "";
  const prevHostEnv = process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID;

  beforeAll(async () => {
    const guest = await db.user.create({
      data: {
        name: "Handoff Guest",
        email: `handoff-guest-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const host = await db.user.create({
      data: {
        name: "Handoff Host",
        email: `handoff-host-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const admin = await db.user.create({
      data: {
        name: "Handoff Admin",
        email: `handoff-admin-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "ADMIN",
      },
    });
    guestId = guest.id;
    hostId = host.id;
    adminId = admin.id;

    await grantHostAuthorization({
      userId: hostId,
      grantedByUserId: adminId,
      provenance: "test-handoff",
    });

    process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID = hostId;

    const app = await db.arayanlarApplication.create({
      data: {
        userId: guestId,
        status: "SUBMITTED",
        prepStatus: "READY",
        submittedRevision: 1,
        editorialTemplateVersion: "kariyer-portresi-producer-v1",
        submittedFacts: {
          displayName: "Handoff Guest",
          targetRole: "QA Lead",
          storyTopic: "Wallet",
          contribution: "strateji",
          workPreferences: "hibrit",
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

    const output = sampleOutput();
    await db.arayanlarArtifact.create({
      data: {
        applicationId,
        kind: "HOST_PACK",
        submittedRevision: 1,
        editorialTemplateVersion: "kariyer-portresi-producer-v1",
        generatedJson: output,
      },
    });
    await db.arayanlarArtifact.create({
      data: {
        applicationId,
        kind: "GUEST_BRIEF",
        submittedRevision: 1,
        editorialTemplateVersion: "kariyer-portresi-producer-v1",
        generatedJson: output,
      },
    });
  });

  afterAll(async () => {
    if (prevHostEnv === undefined) delete process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID;
    else process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID = prevHostEnv;

    const ids = [guestId, hostId, adminId].filter(Boolean);
    await db.directMessage.deleteMany({
      where: { OR: [{ senderId: { in: ids } }] },
    });
    await db.conversationParticipant.deleteMany({ where: { userId: { in: ids } } });
    await db.conversation.deleteMany({
      where: {
        OR: [{ participantLowId: { in: ids } }, { participantHighId: { in: ids } }],
      },
    });
    await db.arayanlarArtifact.deleteMany({ where: { applicationId } });
    await db.arayanlarApplication.deleteMany({ where: { userId: { in: ids } } });
    await db.hostAuthorization.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("READY hazirligim source shows Host'a mesaj at; empty-state page source does not require it when no pack", () => {
    const hazir = readFileSync(path.join(root, "src/app/arayanlar/hazirligim/page.tsx"), "utf8");
    expect(hazir).toMatch(/HostHandoffButton/);
    expect(hazir).toMatch(/\{pack \? <HostHandoffButton \/> : null\}/);
    const button = readFileSync(
      path.join(root, "src/components/arayanlar/host-handoff-button.tsx"),
      "utf8",
    );
    expect(button).toMatch(/Host'a mesaj at/);
    expect(button).toMatch(/\/api\/arayanlar\/host-handoff/);
  });

  it("missing host configuration fails safely without creating a message", async () => {
    const prev = process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID;
    delete process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID;
    const resolved = await resolveDefaultKariyerPortresiHost();
    expect(resolved.ok).toBe(false);

    const before = await db.directMessage.count({ where: { senderId: guestId } });
    const result = await sendKariyerPortresiHostHandoff({ candidateUserId: guestId });
    const after = await db.directMessage.count({ where: { senderId: guestId } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("HOST_NOT_CONFIGURED");
      expect(result.message).toMatch(/yapılandırılmadı/i);
    }
    expect(after).toBe(before);
    process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID = prev;
  });

  it("sends exactly one internal message; repeat is idempotent; link is host-safe", async () => {
    const jobsBefore = await db.aiJob.count({
      where: { userId: guestId, kind: "ARAYANLAR_PREPARE" },
    });

    const first = await sendKariyerPortresiHostHandoff({ candidateUserId: guestId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.alreadySent).toBe(false);
    expect(first.hostNotesPath).toBe(hostPrepNotesPath(applicationId));
    expect(first.hostNotesPath).not.toMatch(/hazirligim/);

    const second = await sendKariyerPortresiHostHandoff({ candidateUserId: guestId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadySent).toBe(true);

    const key = hostHandoffIdempotencyKey({
      applicationId,
      revision: 1,
      hostUserId: hostId,
    });
    const messages = await db.directMessage.findMany({
      where: { senderId: guestId, idempotencyKey: key },
    });
    expect(messages).toHaveLength(1);
    const body = messages[0]?.body ?? "";
    expect(body).toMatch(/Kariyer Portresi kayıt notları hazır/);
    expect(body).toMatch(/Handoff Guest için kayıt öncesi notlar hazır/);
    expect(body).toContain(hostPrepNotesPath(applicationId));
    expect(body.toLowerCase()).not.toMatch(/cv|curriculum|pdf|storage\//);

    const jobsAfter = await db.aiJob.count({
      where: { userId: guestId, kind: "ARAYANLAR_PREPARE" },
    });
    expect(jobsAfter).toBe(jobsBefore);

    const access = await getHostPackForAssignedHost({
      hostUserId: hostId,
      applicationId,
    });
    expect(access.ok).toBe(true);
    if (access.ok) {
      const blob = JSON.stringify(access.effective);
      expect(blob).not.toMatch(/rawCv|extractedText|storage\/|pdf-parse/i);
      expect(access.effective.thinkingScenario.scenario.length).toBeGreaterThan(5);
      expect(access.effective.closingPrep.fixedQuestion).toBe(FIXED_CLOSING_QUESTION);
    }
  });

  it("non-READY application cannot hand off", async () => {
    await db.arayanlarApplication.update({
      where: { id: applicationId },
      data: { prepStatus: "RUNNING" },
    });
    const result = await sendKariyerPortresiHostHandoff({ candidateUserId: guestId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_READY");
    await db.arayanlarApplication.update({
      where: { id: applicationId },
      data: { prepStatus: "READY" },
    });
  });

  it("host-safe notlar page source is read-only and CV-free", () => {
    const src = readFileSync(
      path.join(root, "src/app/sunucu/basvurular/[id]/notlar/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/HostPrepReadonly/);
    expect(src).toMatch(/getHostPackForAssignedHost/);
    expect(src).not.toMatch(/HostPackEditor|readCvExtractedText|generateArayanlar/);
    expect(src).not.toMatch(/hazirligim/);
  });
});
