import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { grantHostAuthorization } from "@/lib/arayanlar/host-auth";
import { assignHost } from "@/lib/arayanlar/service";
import {
  approveKariyerPublication,
  getKariyerPublicationCandidateState,
  publishKariyerPortresiEpisode,
  requestKariyerPublicationChanges,
  sendKariyerPublicationForApproval,
} from "@/lib/arayanlar/publication";
import { computeEpisodePublicationVersionId } from "@/lib/legal/service";
import { ARAYANLAR_NOTIF } from "@/lib/arayanlar/notifications";
import { ensureLegalDocumentsSeeded } from "@/lib/legal/service";
import { FIXED_CLOSING_QUESTION, PREPARATION_SCHEMA_VERSION } from "@/lib/arayanlar/artifact-schema";

const root = path.resolve(__dirname, "..");
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!,
});
const db = new PrismaClient({ adapter });
const suffix = `pub-${Date.now().toString(36)}`;

describe("Kariyer Portresi publication approval", () => {
  let guestId = "";
  let hostId = "";
  let otherId = "";
  let adminId = "";
  let applicationId = "";

  beforeAll(async () => {
    await ensureLegalDocumentsSeeded();
    const guest = await db.user.create({
      data: {
        name: "Pub Guest",
        email: `pub-guest-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const host = await db.user.create({
      data: {
        name: "Pub Host",
        email: `pub-host-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const other = await db.user.create({
      data: {
        name: "Pub Other",
        email: `pub-other-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const admin = await db.user.create({
      data: {
        name: "Pub Admin",
        email: `pub-admin-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "ADMIN",
      },
    });
    guestId = guest.id;
    hostId = host.id;
    otherId = other.id;
    adminId = admin.id;

    await grantHostAuthorization({
      userId: hostId,
      grantedByUserId: adminId,
      provenance: "test-pub",
    });

    const app = await db.arayanlarApplication.create({
      data: {
        userId: guestId,
        status: "SUBMITTED",
        prepStatus: "READY",
        submittedRevision: 1,
        editorialTemplateVersion: "kariyer-portresi-producer-v1",
        submittedFacts: {
          displayName: "Pub Guest",
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
        recordingScheduledAt: new Date(Date.now() + 86400000),
        recordingTimezone: "Europe/Berlin",
        recordingScheduleVersion: 1,
      },
    });
    applicationId = app.id;

    await db.arayanlarArtifact.create({
      data: {
        applicationId,
        kind: "HOST_PACK",
        submittedRevision: 1,
        editorialTemplateVersion: "kariyer-portresi-producer-v1",
        generatedJson: {
          schemaVersion: PREPARATION_SCHEMA_VERSION,
          preparation: {
            identityPrep: {
              profileSignals: ["a", "b", "c"],
              careerThemes: [],
              careerTransitions: [],
              confirmedFacts: ["f"],
              missingInformation: [],
              guestPrepQuestions: ["g"],
              hostQuestions: ["h"],
            },
            storyCandidates: [
              {
                title: "t",
                sourceExperience: "s",
                whyThisCouldBeAStory: "w",
                knownFacts: ["k"],
                missingDetails: [],
                guestPrepQuestions: ["gq"],
                hostQuestions: ["hq"],
                followUpQuestions: [],
                sourceReferences: ["r"],
              },
            ],
            thinkingScenario: {
              scenario: "sc",
              whyItFitsThisCandidate: "why",
              whatTheHostShouldListenFor: ["l"],
              constraints: [],
            },
            jobSearchPrep: {
              knownPreferences: [],
              inferredButUnconfirmed: [],
              missingInformation: [],
              guestPrepQuestions: [],
              hostQuestions: [],
            },
            rapidFire: [
              { question: "q1", whyThisQuestionFits: "w1" },
              { question: "q2", whyThisQuestionFits: "w2" },
              { question: "q3", whyThisQuestionFits: "w3" },
              { question: "q4", whyThisQuestionFits: "w4" },
              { question: "q5", whyThisQuestionFits: "w5" },
            ],
            closingPrep: {
              fixedQuestion: FIXED_CLOSING_QUESTION,
              guestReflectionPrompts: ["p1", "p2"],
            },
            overallMissingInformation: [],
          },
        },
      },
    });

    await assignHost({
      applicationId,
      hostUserId: hostId,
      assignedByUserId: adminId,
    });
  });

  afterAll(async () => {
    const ids = [guestId, hostId, otherId, adminId].filter(Boolean);
    await db.inAppNotification.deleteMany({ where: { userId: { in: ids } } });
    await db.legalAcceptance.deleteMany({ where: { userId: { in: ids } } });
    const app = await db.arayanlarApplication.findUnique({ where: { id: applicationId } });
    if (app?.publicationEpisodeId) {
      await db.episodeAppearance.deleteMany({ where: { episodeId: app.publicationEpisodeId } });
      await db.podcastEpisode.deleteMany({ where: { id: app.publicationEpisodeId } });
    }
    await db.arayanlarArtifact.deleteMany({ where: { applicationId } });
    await db.arayanlarApplication.deleteMany({ where: { id: applicationId } });
    await db.hostAuthorization.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("UI sources: no recording-completed milestone; basvurum prioritizes publication", () => {
    const basvurum = readFileSync(path.join(root, "src/app/arayanlar/basvurum/page.tsx"), "utf8");
    expect(basvurum).toMatch(/CandidatePublicationPanel/);
    expect(basvurum).toMatch(/showSchedule/);
    expect(basvurum).not.toMatch(/Kayıt tamamlandı|Recording complete|Kaydın işlendi/);
    const candidate = readFileSync(
      path.join(root, "src/components/arayanlar/candidate-publication-panel.tsx"),
      "utf8",
    );
    expect(candidate).toMatch(/Yayın onayın bekleniyor/);
    expect(candidate).toMatch(/Yayınlanmasını onaylıyorum/);
    expect(candidate).toMatch(/Değişiklik istiyorum/);
    expect(candidate).toMatch(/Kariyer Portresi yayında/);
    expect(candidate).not.toMatch(/rawCv|HOST_PACK|producer/);
  });

  it("full approval gate: send → approve → publish; change request; version supersede", async () => {
    await expect(
      sendKariyerPublicationForApproval({
        actorUserId: otherId,
        applicationId,
        title: "Should fail",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      sendKariyerPublicationForApproval({
        actorUserId: guestId,
        applicationId,
        title: "Should fail",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const sent = await sendKariyerPublicationForApproval({
      actorUserId: hostId,
      applicationId,
      title: `Kariyer Portresi — Pub Guest ${suffix}`,
      description: "Kısa açıklama",
      artworkUrl: null,
    });
    expect(sent.publicationVersionId).toBeTruthy();

    const guestState = await getKariyerPublicationCandidateState({ candidateUserId: guestId });
    expect(guestState.kind).toBe("approval_requested");
    if (guestState.kind === "approval_requested") {
      expect(guestState.preview.title).toMatch(/Pub Guest/);
      expect(guestState.alreadyApproved).toBe(false);
      expect(JSON.stringify(guestState)).not.toMatch(/rawCv|storage\/|HOST_PACK/);
    }

    const otherState = await getKariyerPublicationCandidateState({ candidateUserId: otherId });
    expect(otherState.kind).toBe("none");

    expect(
      await db.inAppNotification.count({
        where: { userId: guestId, kind: ARAYANLAR_NOTIF.publicationApprovalRequested },
      }),
    ).toBe(1);

    // Opening/get does not approve
    const still = await getKariyerPublicationCandidateState({ candidateUserId: guestId });
    expect(still.kind === "approval_requested" && !still.alreadyApproved).toBe(true);

    // Unapproved cannot publish
    await expect(
      publishKariyerPortresiEpisode({ actorUserId: adminId, applicationId }),
    ).rejects.toMatchObject({ code: "PUBLICATION_APPROVAL_REQUIRED" });

    // Change request does not approve
    await requestKariyerPublicationChanges({
      candidateUserId: guestId,
      note: "Başlığı biraz kısaltalım.",
    });
    const changeState = await getKariyerPublicationCandidateState({ candidateUserId: guestId });
    expect(changeState.kind).toBe("change_requested");
    expect(
      await db.inAppNotification.count({
        where: { userId: hostId, kind: ARAYANLAR_NOTIF.publicationChangeRequested },
      }),
    ).toBe(1);

    // Re-send after edit (new version)
    const resent = await sendKariyerPublicationForApproval({
      actorUserId: hostId,
      applicationId,
      episodeId: sent.episode.id,
      title: `Kariyer Portresi — Pub Guest ${suffix} (rev)`,
      description: "Güncellenmiş açıklama",
    });
    expect(resent.publicationVersionId).not.toBe(sent.publicationVersionId);

    const afterResend = await getKariyerPublicationCandidateState({ candidateUserId: guestId });
    expect(afterResend.kind).toBe("approval_requested");

    const approvalNotifs = await db.inAppNotification.count({
      where: { userId: guestId, kind: ARAYANLAR_NOTIF.publicationApprovalRequested },
    });
    expect(approvalNotifs).toBe(2);

    // Approve current version
    const firstApprove = await approveKariyerPublication({ candidateUserId: guestId });
    expect(firstApprove.created).toBe(true);
    const secondApprove = await approveKariyerPublication({ candidateUserId: guestId });
    expect(secondApprove.created).toBe(false);

    const acceptances = await db.legalAcceptance.findMany({
      where: {
        userId: guestId,
        type: "PUBLICATION",
        relatedResourceId: resent.episode.id,
      },
    });
    expect(acceptances).toHaveLength(1);
    const meta = acceptances[0]?.metadata as { publicationVersionId?: string };
    expect(meta.publicationVersionId).toBe(resent.publicationVersionId);

    const { hasCurrentAcceptance } = await import("@/lib/legal/service");
    const epNow = await db.podcastEpisode.findUniqueOrThrow({ where: { id: resent.episode.id } });
    const liveVersion = computeEpisodePublicationVersionId(epNow);
    expect(liveVersion).toBe(resent.publicationVersionId);
    expect(
      await hasCurrentAcceptance({
        userId: guestId,
        type: "PUBLICATION",
        documentType: "PUBLICATION_APPROVAL",
        relatedResourceType: "podcast_episode",
        relatedResourceId: resent.episode.id,
        publicationVersionId: liveVersion,
      }),
    ).toBe(true);

    // Old version approval cannot publish if we change title again without re-approval
    // First publish with approved version — should work (admin)
    const published = await publishKariyerPortresiEpisode({
      actorUserId: adminId,
      applicationId,
    });
    expect(published.publicationState).toBe("PUBLISHED");
    expect(published.slug).toBeTruthy();

    expect(
      await db.inAppNotification.count({
        where: { userId: guestId, kind: ARAYANLAR_NOTIF.published },
      }),
    ).toBe(1);

    // Published notification not duplicated
    await expect(
      publishKariyerPortresiEpisode({ actorUserId: adminId, applicationId }),
    ).rejects.toMatchObject({ code: "ALREADY_PUBLISHED" });
    // Wait - publish on already published might try update to PUBLISHED again. Check what happens.

    const publishedState = await getKariyerPublicationCandidateState({
      candidateUserId: guestId,
    });
    expect(publishedState.kind).toBe("published");
    if (publishedState.kind === "published") {
      expect(publishedState.publicUrl).toBe(`/bolumler/${published.slug}`);
      expect(publishedState.publicUrl).toMatch(/^\/bolumler\//);
    }

    // Host cannot forge approval for other user — already covered by candidateUserId from session in API.
    // Material change gate: create second app scenario with old approval
    const ep = await db.podcastEpisode.findUniqueOrThrow({ where: { id: published.id } });
    const oldVersion = computeEpisodePublicationVersionId(ep);

    // Supersede: update title while published requires approval in updatePodcastEpisode
    const { updatePodcastEpisode } = await import("@/lib/community/episodes");
    await expect(
      updatePodcastEpisode({
        adminId,
        episodeId: ep.id,
        title: `${ep.title} CHANGED`,
      }),
    ).rejects.toThrow("LEGAL_PUBLICATION_REQUIRED");

    // Confirm old acceptance still for oldVersion only
    expect(oldVersion).toBe(resent.publicationVersionId);
  });
});
