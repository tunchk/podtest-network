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
    const apps = await db.arayanlarApplication.findMany({
      where: { OR: [{ id: applicationId }, { userId: { in: ids } }, { user: { email: { contains: `pub-guest2-${suffix}` } } }] },
      select: { id: true, userId: true, publicationEpisodeId: true },
    });
    const episodeIds = apps
      .map((a) => a.publicationEpisodeId)
      .filter((id): id is string => Boolean(id));
    const appIds = apps.map((a) => a.id);
    const userIds = [...new Set([...ids, ...apps.map((a) => a.userId)])];

    await db.inAppNotification.deleteMany({ where: { userId: { in: userIds } } });
    await db.legalAcceptance.deleteMany({ where: { userId: { in: userIds } } });
    if (episodeIds.length) {
      await db.episodeAppearance.deleteMany({ where: { episodeId: { in: episodeIds } } });
      await db.podcastEpisode.deleteMany({ where: { id: { in: episodeIds } } });
    }
    // Episodes createdBy test users without app link
    await db.podcastEpisode.deleteMany({ where: { createdById: { in: userIds } } });
    await db.arayanlarArtifact.deleteMany({ where: { applicationId: { in: appIds } } });
    await db.arayanlarApplication.deleteMany({ where: { id: { in: appIds } } });
    await db.hostAuthorization.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
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

  it("blocks withdraw after publish and keeps candidate state coherent", async () => {
    const { withdrawApplication } = await import("@/lib/arayanlar/service");
    const app = await db.arayanlarApplication.findUniqueOrThrow({ where: { id: applicationId } });
    const episode = app.publicationEpisodeId
      ? await db.podcastEpisode.findUniqueOrThrow({ where: { id: app.publicationEpisodeId } })
      : null;
    expect(episode?.publicationState).toBe("PUBLISHED");

    await expect(withdrawApplication(guestId)).rejects.toMatchObject({
      code: "ALREADY_PUBLISHED",
    });

    const still = await db.arayanlarApplication.findUniqueOrThrow({ where: { id: applicationId } });
    expect(still.status).toBe("SUBMITTED");
    expect(still.withdrawnAt).toBeNull();

    const state = await getKariyerPublicationCandidateState({ candidateUserId: guestId });
    expect(state.kind).toBe("published");
  });

  it("marks approval stale when live episode version diverges from review version", async () => {
    // Fresh draft episode path for isolation — reuse host-owned app fields carefully.
    // Use a separate guest to avoid clobbering the published application above.
    const guest2 = await db.user.create({
      data: {
        name: "Pub Guest2",
        email: `pub-guest2-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const app2 = await db.arayanlarApplication.create({
      data: {
        userId: guest2.id,
        status: "SUBMITTED",
        prepStatus: "READY",
        submittedRevision: 1,
        editorialTemplateVersion: "kariyer-portresi-producer-v1",
        submittedFacts: {
          displayName: "Pub Guest2",
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
        assignedHostUserId: hostId,
        assignedAt: new Date(),
        assignedByUserId: adminId,
      },
    });
    await db.arayanlarArtifact.create({
      data: {
        applicationId: app2.id,
        kind: "HOST_PACK",
        submittedRevision: 1,
        editorialTemplateVersion: "kariyer-portresi-producer-v1",
        generatedJson: { schemaVersion: PREPARATION_SCHEMA_VERSION, preparation: {} },
      },
    }).catch(() => null);

    // Minimal prep artifact may fail schema — skip if create fails; use send which needs READY.
    // HOST_PACK content is not required for publication send beyond prepStatus READY.
    const sent = await sendKariyerPublicationForApproval({
      actorUserId: hostId,
      applicationId: app2.id,
      title: `KP Guest2 ${suffix}`,
      description: "v1",
    });
    await approveKariyerPublication({ candidateUserId: guest2.id });

    // Material edit outside send_for_approval (simulates stale review id)
    await db.podcastEpisode.update({
      where: { id: sent.episode.id },
      data: { title: `KP Guest2 ${suffix} CHANGED` },
    });
    // Keep old reviewVersionId on application
    await db.arayanlarApplication.update({
      where: { id: app2.id },
      data: { publicationReviewVersionId: sent.publicationVersionId },
    });

    const state = await getKariyerPublicationCandidateState({ candidateUserId: guest2.id });
    expect(state.kind).toBe("approval_requested");
    if (state.kind === "approval_requested") {
      expect(state.alreadyApproved).toBe(false);
    }

    await expect(
      publishKariyerPortresiEpisode({ actorUserId: adminId, applicationId: app2.id }),
    ).rejects.toMatchObject({ code: "PUBLICATION_APPROVAL_REQUIRED" });

    // Reject appearance then try guest-less bolumler publish — must still require KP approval.
    await db.episodeAppearance.updateMany({
      where: { episodeId: sent.episode.id, memberUserId: guest2.id },
      data: { status: "REJECTED", rejectedAt: new Date() },
    });
    const { updatePodcastEpisode } = await import("@/lib/community/episodes");
    await expect(
      updatePodcastEpisode({
        adminId,
        episodeId: sent.episode.id,
        publicationState: "PUBLISHED",
      }),
    ).rejects.toThrow("LEGAL_PUBLICATION_REQUIRED");

    // Artwork is part of publication version — changing it must invalidate prior approval path.
    const beforeArt = computeEpisodePublicationVersionId(
      await db.podcastEpisode.findUniqueOrThrow({ where: { id: sent.episode.id } }),
    );
    const afterArt = computeEpisodePublicationVersionId({
      ...(await db.podcastEpisode.findUniqueOrThrow({ where: { id: sent.episode.id } })),
      artworkUrl: "https://example.com/cover.png",
    });
    expect(afterArt).not.toBe(beforeArt);
  });
});
