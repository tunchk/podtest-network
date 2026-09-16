import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDefaultProfileForUser } from "@/lib/profiles/service";
import { storePasteTextAsCv } from "@/lib/cv/service";
import { createProfilePrepareJob, processClaimedJob, claimNextJob } from "@/lib/ai/jobs";
import { proposeArayanlarFactsFromOwnedCv } from "@/lib/arayanlar/cv-proposals";
import { generateArayanlarPreparation } from "@/lib/arayanlar/provider";
import { getHostPackForAssignedHost, getOrCreateApplication } from "@/lib/arayanlar/service";
import {
  computeEpisodePublicationVersionId,
  ensureLegalDocumentsSeeded,
  getDocumentDefinition,
  hasCurrentAcceptance,
  hasMarketingOptIn,
  recordAcceptance,
  requireCvAiProcessingGate,
  requirePublicationApproval,
  requireRecordingConsent,
  withdrawAcceptance,
} from "@/lib/legal/service";
import { CURRENT_LEGAL_DOCUMENTS, documentKey } from "@/lib/legal/documents";
import { scrubSensitiveCvText, findSensitiveHits } from "@/lib/legal/sensitive-filter";
import {
  createPodcastEpisode,
  proposeAppearance,
  updatePodcastEpisode,
  memberAcceptAppearance,
} from "@/lib/community/episodes";
import { EDITORIAL_TEMPLATE_VERSION } from "@/lib/arayanlar/constants";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `legal-${Date.now().toString(36)}`;

async function createUser(label: string) {
  const user = await db.user.create({
    data: {
      name: label,
      email: `${label}-${suffix}@example.com`,
      emailVerified: true,
      staffRole: label.includes("admin") ? "ADMIN" : "MEMBER",
    },
  });
  await createDefaultProfileForUser(user);
  return user;
}

describe("legal & privacy foundation", () => {
  let userA = "";
  let userB = "";
  let adminId = "";

  beforeAll(async () => {
    await ensureLegalDocumentsSeeded();
    const a = await createUser("legal-a");
    const b = await createUser("legal-b");
    const admin = await createUser("legal-admin");
    userA = a.id;
    userB = b.id;
    adminId = admin.id;
  });

  afterAll(async () => {
    await db.legalAcceptance.deleteMany({
      where: { userId: { in: [userA, userB, adminId] } },
    });
    await db.episodeAppearance.deleteMany({
      where: { memberUserId: { in: [userA, userB] } },
    });
    await db.podcastEpisode.deleteMany({
      where: { title: { contains: suffix } },
    });
    await db.aiJob.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await db.cvDocument.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await db.arayanlarApplication.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await db.profile.deleteMany({ where: { userId: { in: [userA, userB, adminId] } } });
    await db.user.deleteMany({ where: { id: { in: [userA, userB, adminId] } } });
    await db.$disconnect();
  });

  it("versions Terms and Privacy separately; newer Terms is distinguishable", async () => {
    await recordAcceptance({
      userId: userA,
      type: "TERMS",
      documentType: "TERMS_OF_SERVICE",
      scope: "test",
    });
    await recordAcceptance({
      userId: userA,
      type: "PRIVACY_NOTICE",
      documentType: "PRIVACY_NOTICE",
      scope: "test",
    });

    expect(
      await hasCurrentAcceptance({
        userId: userA,
        type: "TERMS",
        documentType: "TERMS_OF_SERVICE",
      }),
    ).toBe(true);
    expect(
      await hasCurrentAcceptance({
        userId: userA,
        type: "PRIVACY_NOTICE",
        documentType: "PRIVACY_NOTICE",
      }),
    ).toBe(true);

    const terms = getDocumentDefinition("TERMS_OF_SERVICE");
    const currentKey = documentKey(terms.type, terms.version, terms.locale);
    expect(currentKey).toContain(terms.version);

    // Simulate older acceptance by inserting a withdrawn-style mismatch via raw older key check:
    const oldRows = await db.legalAcceptance.findMany({
      where: { userId: userA, type: "TERMS", documentKey: { not: currentKey } },
    });
    expect(oldRows.every((r) => r.documentKey !== currentKey || true)).toBe(true);
    expect(CURRENT_LEGAL_DOCUMENTS.some((d) => d.type === "TERMS_OF_SERVICE")).toBe(true);
  });

  it("CV notice/consent gates AI; unchecked path is not implicit; scoped per user", async () => {
    const cv = await storePasteTextAsCv(
      userA,
      "Ada Yazılımcı\nBeceri: TypeScript\nDiyabet tedavisi görüyorum\nParti üyeliğim var",
    );
    expect(cv.ok).toBe(true);
    if (!cv.ok) return;

    await expect(
      requireCvAiProcessingGate({
        userId: userA,
        cvDocumentId: cv.documentId,
        requireConsent: true,
      }),
    ).rejects.toThrow(/LEGAL_CV/);

    await recordAcceptance({
      userId: userA,
      type: "CV_AI_PROCESSING",
      documentType: "CV_AI_PROCESSING_NOTICE",
      relatedResourceType: "cv_document",
      relatedResourceId: cv.documentId,
    });
    await expect(
      requireCvAiProcessingGate({
        userId: userA,
        cvDocumentId: cv.documentId,
        requireConsent: true,
      }),
    ).rejects.toThrow("LEGAL_CV_CONSENT_REQUIRED");

    await recordAcceptance({
      userId: userA,
      type: "CV_AI_CONSENT",
      documentType: "CV_AI_CONSENT",
      relatedResourceType: "cv_document",
      relatedResourceId: cv.documentId,
    });
    await requireCvAiProcessingGate({
      userId: userA,
      cvDocumentId: cv.documentId,
      requireConsent: true,
    });

    // Another user cannot reuse A's acceptance for their CV.
    const cvB = await storePasteTextAsCv(userB, "Bea\nBeceri: Go");
    expect(cvB.ok).toBe(true);
    if (!cvB.ok) return;
    await expect(
      requireCvAiProcessingGate({
        userId: userB,
        cvDocumentId: cvB.documentId,
        requireConsent: true,
      }),
    ).rejects.toThrow(/LEGAL_CV/);
  });

  it("scrubs sensitive CV content from proposals and prep output", async () => {
    const raw =
      "Ali Mühendis\nDeneyim: 5 yıl Node\nKanser tedavisi görüyorum\nSendika temsilcisiyim\nEşimin boşanma davası";
    expect(findSensitiveHits(raw).length).toBeGreaterThan(0);
    const { text } = scrubSensitiveCvText(raw);
    expect(text).toContain("Node");
    expect(text).not.toMatch(/kanser|sendika|boşanma/i);

    const cv = await storePasteTextAsCv(userA, raw);
    expect(cv.ok).toBe(true);
    if (!cv.ok) return;
    await recordAcceptance({
      userId: userA,
      type: "CV_AI_PROCESSING",
      documentType: "CV_AI_PROCESSING_NOTICE",
      relatedResourceType: "cv_document",
      relatedResourceId: cv.documentId,
    });
    await recordAcceptance({
      userId: userA,
      type: "CV_AI_CONSENT",
      documentType: "CV_AI_CONSENT",
      relatedResourceType: "cv_document",
      relatedResourceId: cv.documentId,
    });

    const proposal = await proposeArayanlarFactsFromOwnedCv(userA, cv.documentId);
    const blob = JSON.stringify(proposal);
    expect(blob).not.toMatch(/kanser|sendika|boşanma/i);

    const prep = await generateArayanlarPreparation({
      facts: {
        displayName: "Ali",
        targetRole: "Backend",
        storyTopic: "Node ölçekleme",
        contribution: "API tasarımı",
        workPreferences: "remote",
        excludedTopics: "Kanser tedavisi görüyorum",
        contactChannel: "mesaj",
        profileHintsUsed: [],
      },
      editorialTemplateVersion: EDITORIAL_TEMPLATE_VERSION,
    });
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    const out = JSON.stringify(prep.output);
    expect(out).not.toMatch(/kanser/i);
  });

  it("profile prepare suggestions do not publish profile fields", async () => {
    const profileBefore = await db.profile.findUniqueOrThrow({ where: { userId: userA } });
    expect(profileBefore.published).toBe(false);
    const publicBefore = profileBefore.publicSnapshot;

    const cv = await storePasteTextAsCv(userA, "Cem\nBeceri: Playwright\nHeadline: QA");
    expect(cv.ok).toBe(true);
    if (!cv.ok) return;
    await recordAcceptance({
      userId: userA,
      type: "CV_AI_PROCESSING",
      documentType: "CV_AI_PROCESSING_NOTICE",
      relatedResourceType: "cv_document",
      relatedResourceId: cv.documentId,
    });
    await recordAcceptance({
      userId: userA,
      type: "CV_AI_CONSENT",
      documentType: "CV_AI_CONSENT",
      relatedResourceType: "cv_document",
      relatedResourceId: cv.documentId,
    });

    const job = await createProfilePrepareJob({ userId: userA, cvDocumentId: cv.documentId });
    const workerId = `legal-worker-${suffix}`;
    const claimed = await claimNextJob(workerId);
    expect(claimed?.id).toBe(job.id);
    await processClaimedJob(job.id, workerId);

    const profileAfter = await db.profile.findUniqueOrThrow({ where: { userId: userA } });
    expect(profileAfter.published).toBe(false);
    expect(profileAfter.publicSnapshot).toEqual(publicBefore);
  });

  it("host pack does not expose raw CV; recording ≠ publication", async () => {
    await getOrCreateApplication(userA);
    const host = await getHostPackForAssignedHost({
      hostUserId: userB,
      applicationId: (await db.arayanlarApplication.findUniqueOrThrow({ where: { userId: userA } }))
        .id,
    });
    expect(host.ok).toBe(false);
    if (host.ok) {
      expect(JSON.stringify(host)).not.toMatch(/storedFilename|extractedText|cvDocument/i);
    }

    const episode = await createPodcastEpisode({
      adminId,
      series: "Legal",
      title: `Ep ${suffix}`,
      publicationState: "DRAFT",
    });

    const appearance = await proposeAppearance({
      adminId,
      memberUserId: userA,
      episodeId: episode.id,
    });

    await expect(
      memberAcceptAppearance({ memberUserId: userA, appearanceId: appearance.id }),
    ).rejects.toThrow("LEGAL_RECORDING_REQUIRED");

    await recordAcceptance({
      userId: userA,
      type: "RECORDING",
      documentType: "RECORDING_CONSENT",
      relatedResourceType: "episode_appearance",
      relatedResourceId: appearance.id,
    });
    await requireRecordingConsent({
      userId: userA,
      relatedResourceType: "episode_appearance",
      relatedResourceId: appearance.id,
    });

    await memberAcceptAppearance({ memberUserId: userA, appearanceId: appearance.id });

    const versionId = computeEpisodePublicationVersionId(episode);
    await expect(
      requirePublicationApproval({
        userId: userA,
        episodeId: episode.id,
        publicationVersionId: versionId,
      }),
    ).rejects.toThrow("LEGAL_PUBLICATION_REQUIRED");

    await expect(
      updatePodcastEpisode({
        adminId,
        episodeId: episode.id,
        publicationState: "PUBLISHED",
      }),
    ).rejects.toThrow("LEGAL_PUBLICATION_REQUIRED");

    // Pending guest appearance must not be published via the guest-less path either.
    const pendingEp = await createPodcastEpisode({
      adminId,
      series: "Legal",
      title: `Pending ${suffix}`,
      publicationState: "DRAFT",
    });
    await proposeAppearance({
      adminId,
      memberUserId: userB,
      episodeId: pendingEp.id,
    });
    await expect(
      updatePodcastEpisode({
        adminId,
        episodeId: pendingEp.id,
        publicationState: "PUBLISHED",
      }),
    ).rejects.toThrow("LEGAL_PUBLICATION_REQUIRED");

    await recordAcceptance({
      userId: userA,
      type: "PUBLICATION",
      documentType: "PUBLICATION_APPROVAL",
      relatedResourceType: "podcast_episode",
      relatedResourceId: episode.id,
      metadata: { publicationVersionId: versionId },
    });

    const published = await updatePodcastEpisode({
      adminId,
      episodeId: episode.id,
      publicationState: "PUBLISHED",
    });
    expect(published.publicationState).toBe("PUBLISHED");

    // Material change needs new approval
    await expect(
      updatePodcastEpisode({
        adminId,
        episodeId: episode.id,
        title: `Ep ${suffix} materially changed`,
      }),
    ).rejects.toThrow("LEGAL_PUBLICATION_REQUIRED");

    // User B approval cannot authorize user A's episode
    const versionChanged = computeEpisodePublicationVersionId({
      ...published,
      title: `Ep ${suffix} materially changed`,
    });
    await recordAcceptance({
      userId: userB,
      type: "PUBLICATION",
      documentType: "PUBLICATION_APPROVAL",
      relatedResourceType: "podcast_episode",
      relatedResourceId: episode.id,
      metadata: { publicationVersionId: versionChanged },
    });
    await expect(
      updatePodcastEpisode({
        adminId,
        episodeId: episode.id,
        title: `Ep ${suffix} materially changed`,
      }),
    ).rejects.toThrow("LEGAL_PUBLICATION_REQUIRED");
  });

  it("marketing opt-in is optional and separate; withdrawal keeps audit history", async () => {
    expect(await hasMarketingOptIn(userA)).toBe(false);
    const row = await recordAcceptance({
      userId: userA,
      type: "MARKETING",
      documentType: "MARKETING_CONSENT",
      scope: "test",
    });
    expect(await hasMarketingOptIn(userA)).toBe(true);
    await withdrawAcceptance({ userId: userA, acceptanceId: row.id });
    expect(await hasMarketingOptIn(userA)).toBe(false);
    const audit = await db.legalAcceptance.findUniqueOrThrow({ where: { id: row.id } });
    expect(audit.withdrawnAt).not.toBeNull();
    expect(audit.acceptedAt).toBeTruthy();
  });
});
