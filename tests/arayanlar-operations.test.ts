import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ArayanlarApplication, type PodcastEpisode } from "@/generated/prisma/client";
import { grantHostAuthorization } from "@/lib/arayanlar/host-auth";
import { assignHost } from "@/lib/arayanlar/service";
import {
  deriveKariyerPortresiOperations,
  getKariyerPortresiOperationsView,
} from "@/lib/arayanlar/operations";
import { computeEpisodePublicationVersionId } from "@/lib/legal/service";
import { FIXED_CLOSING_QUESTION, PREPARATION_SCHEMA_VERSION } from "@/lib/arayanlar/artifact-schema";

const root = path.resolve(__dirname, "..");
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!,
});
const db = new PrismaClient({ adapter });
const suffix = `ops-${Date.now().toString(36)}`;

function baseApp(overrides: Partial<ArayanlarApplication> = {}): ArayanlarApplication {
  const now = new Date("2026-04-01T10:00:00.000Z");
  return {
    id: "app-1",
    userId: "guest-1",
    status: "SUBMITTED",
    prepStatus: "READY",
    draftAnswers: {},
    conversationTurns: [],
    questionsAsked: 0,
    useSummaryFallback: false,
    submittedFacts: {
      displayName: "Aday Adı",
      targetRole: "QA Lead",
      storyTopic: "x",
      contribution: "y",
      workPreferences: "",
      excludedTopics: "",
      contactChannel: "platform",
      profileHintsUsed: [],
    },
    submittedRevision: 1,
    submittedAt: now,
    confirmedCostAt: now,
    editorialTemplateVersion: "kariyer-portresi-producer-v1",
    withdrawnAt: null,
    assignedHostUserId: null,
    assignedAt: null,
    assignedByUserId: null,
    prepareJobId: null,
    recordingScheduledAt: null,
    recordingTimezone: null,
    recordingMeetingUrl: null,
    recordingSchedulingNote: null,
    recordingScheduledByUserId: null,
    recordingScheduleUpdatedAt: null,
    recordingScheduleVersion: 0,
    recordingCompletedAt: null,
    publicationEpisodeId: null,
    publicationReviewRequestedAt: null,
    publicationReviewVersionId: null,
    publicationChangeRequestNote: null,
    publicationChangeRequestedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as ArayanlarApplication;
}

function baseEpisode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  const now = new Date("2026-04-10T12:00:00.000Z");
  return {
    id: "ep-1",
    series: "Kariyer Portresi",
    title: "Kariyer Portresi — Aday",
    slug: "kariyer-portresi-aday",
    description: "Desc",
    descriptionHtml: null,
    audioUrl: null,
    listeningUrl: "https://example.com/listen",
    spotifyEpisodeUrl: null,
    artworkUrl: null,
    durationSeconds: null,
    episodeNumber: null,
    seasonNumber: null,
    publicationDate: null,
    publicationState: "DRAFT",
    sourceKind: "MANUAL",
    feedConfigId: null,
    rssGuid: null,
    importedSnapshot: null,
    manualOverrides: null,
    createdById: "admin-1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as PodcastEpisode;
}

function derive(
  overrides: {
    app?: Partial<ArayanlarApplication>;
    episode?: PodcastEpisode | null;
    hostPackExists?: boolean;
    handoffMessage?: { createdAt: Date } | null;
    alreadyApprovedCurrent?: boolean;
    approvedAt?: Date | null;
    actorIsAdmin?: boolean;
    defaultHostOk?: boolean;
    prepJob?: { status: string; attemptCount: number; maxAttempts: number } | null;
  } = {},
) {
  const defaultHost = overrides.defaultHostOk === false
    ? ({
        ok: false as const,
        code: "HOST_NOT_CONFIGURED" as const,
        message: "missing",
      })
    : ({ ok: true as const, userId: "host-1", name: "Default Host" });

  return deriveKariyerPortresiOperations({
    app: baseApp(overrides.app),
    candidateName: "Aday Adı",
    candidateEmail: "aday@example.com",
    hostPackExists: overrides.hostPackExists ?? true,
    artifactUpdatedAt: new Date("2026-04-01T11:00:00.000Z"),
    prepJob: overrides.prepJob ?? null,
    defaultHost,
    assignedHostName: "Default Host",
    handoffMessage: overrides.handoffMessage ?? null,
    scheduledByName: null,
    episode: overrides.episode === undefined ? null : overrides.episode,
    alreadyApprovedCurrent: overrides.alreadyApprovedCurrent ?? false,
    approvedAt: overrides.approvedAt ?? null,
    actorIsAdmin: overrides.actorIsAdmin ?? true,
    actorAs: overrides.actorIsAdmin === false ? "host" : "admin",
  });
}

describe("deriveKariyerPortresiOperations", () => {
  it("prep pending → waits for notes", () => {
    const view = derive({
      app: { prepStatus: "QUEUED" },
      hostPackExists: false,
    });
    expect(view.nextAction).toMatchObject({ kind: "wait", label: "Hazırlık notlarını bekliyor" });
    expect(view.progress.find((s) => s.id === "hazirlik")?.status).toBe("bekliyor");
    expect(view.applicationStatusLabel).toBe("Gönderildi");
    expect(view.primaryLabel).not.toMatch(/QUEUED|READY|SUBMITTED/);
  });

  it("prep READY + no handoff → host handoff next", () => {
    const view = derive({ handoffMessage: null });
    expect(view.nextAction).toMatchObject({
      kind: "action",
      action: "host_handoff",
      label: "Host'a gönder",
    });
    expect(view.hostHandoff.sent).toBe(false);
  });

  it("handoff complete + no schedule → schedule next", () => {
    const view = derive({
      handoffMessage: { createdAt: new Date("2026-04-02T09:00:00.000Z") },
    });
    expect(view.nextAction).toMatchObject({
      kind: "action",
      action: "schedule",
      label: "Kayıt zamanını belirle",
    });
    expect(view.progress.find((s) => s.id === "host")?.status).toBe("tamamlandi");
  });

  it("scheduled + no publication review → waiting/prep info state", () => {
    const view = derive({
      handoffMessage: { createdAt: new Date() },
      app: {
        recordingScheduledAt: new Date("2026-05-01T10:00:00.000Z"),
        recordingTimezone: "Europe/Istanbul",
        recordingScheduleUpdatedAt: new Date("2026-04-03T10:00:00.000Z"),
        recordingScheduleVersion: 1,
      },
      episode: null,
    });
    expect(view.nextAction).toMatchObject({
      kind: "info",
      label: "Kayıt sonrası yayın versiyonu hazırlanacak",
    });
    expect(view.recording.scheduled).toBe(true);
  });

  it("review requested → waiting for candidate", () => {
    const episode = baseEpisode();
    const versionId = computeEpisodePublicationVersionId(episode);
    const view = derive({
      handoffMessage: { createdAt: new Date() },
      app: {
        recordingScheduledAt: new Date("2026-05-01T10:00:00.000Z"),
        recordingTimezone: "Europe/Istanbul",
        recordingScheduleVersion: 1,
        publicationEpisodeId: episode.id,
        publicationReviewRequestedAt: new Date("2026-05-02T10:00:00.000Z"),
        publicationReviewVersionId: versionId,
      },
      episode,
      alreadyApprovedCurrent: false,
    });
    expect(view.nextAction).toMatchObject({
      kind: "wait",
      label: "Aday yayın onayı bekleniyor",
    });
    expect(view.publication.candidateDecision).toBe("waiting");
    expect(view.primaryLabel).toBe("Yayın onayı bekleniyor");
  });

  it("candidate change request → change-request state visible", () => {
    const episode = baseEpisode();
    const versionId = computeEpisodePublicationVersionId(episode);
    const view = derive({
      handoffMessage: { createdAt: new Date() },
      app: {
        recordingScheduledAt: new Date("2026-05-01T10:00:00.000Z"),
        recordingTimezone: "Europe/Istanbul",
        recordingScheduleVersion: 1,
        publicationEpisodeId: episode.id,
        publicationReviewRequestedAt: new Date("2026-05-02T10:00:00.000Z"),
        publicationReviewVersionId: versionId,
        publicationChangeRequestNote: "Başlığı kısaltın lütfen",
        publicationChangeRequestedAt: new Date("2026-05-03T10:00:00.000Z"),
      },
      episode,
    });
    expect(view.nextAction).toMatchObject({
      kind: "action",
      action: "review_change_request",
      label: "Değişiklik talebini incele",
    });
    expect(view.publication.candidateDecision).toBe("change_requested");
    expect(view.publication.changeNote).toBe("Başlığı kısaltın lütfen");
    expect(view.primaryLabel).toBe("Değişiklik istendi");
  });

  it("candidate approved → publish available to authorized admin", () => {
    const episode = baseEpisode();
    const versionId = computeEpisodePublicationVersionId(episode);
    const view = derive({
      handoffMessage: { createdAt: new Date() },
      app: {
        recordingScheduledAt: new Date("2026-05-01T10:00:00.000Z"),
        recordingTimezone: "Europe/Istanbul",
        recordingScheduleVersion: 1,
        publicationEpisodeId: episode.id,
        publicationReviewRequestedAt: new Date("2026-05-02T10:00:00.000Z"),
        publicationReviewVersionId: versionId,
      },
      episode,
      alreadyApprovedCurrent: true,
      approvedAt: new Date("2026-05-04T10:00:00.000Z"),
      actorIsAdmin: true,
    });
    expect(view.nextAction).toMatchObject({ kind: "action", action: "publish", label: "Yayına al" });
    expect(view.publication.canPublish).toBe(true);
    expect(view.publication.publishBlockedReason).toBeNull();
  });

  it("host actor sees approved but cannot publish", () => {
    const episode = baseEpisode();
    const versionId = computeEpisodePublicationVersionId(episode);
    const view = derive({
      handoffMessage: { createdAt: new Date() },
      app: {
        recordingScheduledAt: new Date(),
        recordingTimezone: "Europe/Istanbul",
        recordingScheduleVersion: 1,
        publicationEpisodeId: episode.id,
        publicationReviewRequestedAt: new Date(),
        publicationReviewVersionId: versionId,
      },
      episode,
      alreadyApprovedCurrent: true,
      actorIsAdmin: false,
    });
    expect(view.publication.canPublish).toBe(false);
    expect(view.publication.publishBlockedReason).toMatch(/yönetim yetkisi/i);
  });

  it("changed publication version invalidates old approval in operations UI", () => {
    const episode = baseEpisode({ title: "Yeni başlık" });
    const oldVersionId = "stale-version-id";
    const view = derive({
      handoffMessage: { createdAt: new Date() },
      app: {
        recordingScheduledAt: new Date(),
        recordingTimezone: "Europe/Istanbul",
        recordingScheduleVersion: 1,
        publicationEpisodeId: episode.id,
        publicationReviewRequestedAt: new Date(),
        publicationReviewVersionId: oldVersionId,
      },
      episode,
      alreadyApprovedCurrent: true,
    });
    expect(view.publication.versionMatchesReview).toBe(false);
    expect(view.publication.alreadyApprovedCurrent).toBe(false);
    expect(view.publication.canPublish).toBe(false);
    expect(view.issues.some((i) => /yeniden onay/i.test(i))).toBe(true);
    expect(view.nextAction).toMatchObject({
      kind: "action",
      action: "send_publication_review",
    });
  });

  it("published → final state + canonical public link", () => {
    const episode = baseEpisode({ publicationState: "PUBLISHED", slug: "kp-aday" });
    const versionId = computeEpisodePublicationVersionId(episode);
    const view = derive({
      handoffMessage: { createdAt: new Date() },
      app: {
        recordingScheduledAt: new Date(),
        recordingTimezone: "Europe/Istanbul",
        recordingScheduleVersion: 1,
        publicationEpisodeId: episode.id,
        publicationReviewRequestedAt: new Date(),
        publicationReviewVersionId: versionId,
      },
      episode,
      alreadyApprovedCurrent: true,
    });
    expect(view.nextAction).toMatchObject({
      kind: "done",
      label: "Yayınlandı",
      href: "/bolumler/kp-aday",
    });
    expect(view.publication.publicPath).toBe("/bolumler/kp-aday");
    expect(view.primaryLabel).toBe("Kariyer Portresi yayında");
  });

  it("does not expose raw backend enums in primary labels", () => {
    const view = derive({ app: { prepStatus: "RUNNING" }, hostPackExists: false });
    expect(view.primaryLabel).toBe("Hazırlık sürüyor");
    expect(view.preparation.label).toBe("Oluşturuluyor");
  });
});

describe("getKariyerPortresiOperationsView authorization", () => {
  let guestId = "";
  let hostId = "";
  let otherId = "";
  let adminId = "";
  let applicationId = "";
  const prevHostEnv = process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID;

  beforeAll(async () => {
    const guest = await db.user.create({
      data: {
        name: "Ops Guest",
        email: `ops-guest-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const host = await db.user.create({
      data: {
        name: "Ops Host",
        email: `ops-host-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const other = await db.user.create({
      data: {
        name: "Ops Other",
        email: `ops-other-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const admin = await db.user.create({
      data: {
        name: "Ops Admin",
        email: `ops-admin-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "ADMIN",
      },
    });
    guestId = guest.id;
    hostId = host.id;
    otherId = other.id;
    adminId = admin.id;
    process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID = hostId;

    await grantHostAuthorization({
      userId: hostId,
      grantedByUserId: adminId,
      provenance: "test-ops",
    });

    const app = await db.arayanlarApplication.create({
      data: {
        userId: guestId,
        status: "SUBMITTED",
        prepStatus: "READY",
        submittedRevision: 1,
        editorialTemplateVersion: "kariyer-portresi-producer-v1",
        submittedFacts: {
          displayName: "Ops Guest",
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
              guestPrepQuestions: ["q"],
              hostQuestions: ["h"],
            },
            storyCandidates: [],
            thinkingScenario: {
              scenario: "s",
              whyItFitsThisCandidate: "w",
              whatTheHostShouldListenFor: ["l"],
              constraints: [],
            },
            jobSearchPrep: {
              knownPreferences: [],
              inferredButUnconfirmed: [],
              missingInformation: [],
              guestPrepQuestions: ["g"],
              hostQuestions: ["h"],
            },
            rapidFire: [
              { question: "1", whyThisQuestionFits: "x" },
              { question: "2", whyThisQuestionFits: "x" },
              { question: "3", whyThisQuestionFits: "x" },
              { question: "4", whyThisQuestionFits: "x" },
              { question: "5", whyThisQuestionFits: "x" },
            ],
            closingPrep: {
              fixedQuestion: FIXED_CLOSING_QUESTION,
              guestReflectionPrompts: ["r"],
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
    if (prevHostEnv === undefined) {
      delete process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID;
    } else {
      process.env.KARIYER_PORTRESI_DEFAULT_HOST_USER_ID = prevHostEnv;
    }
    await db.$disconnect();
  });

  it("unrelated user cannot access operations page", async () => {
    const denied = await getKariyerPortresiOperationsView({
      actorUserId: otherId,
      applicationId,
    });
    expect(denied.ok).toBe(false);
  });

  it("candidate cannot access operations page", async () => {
    const denied = await getKariyerPortresiOperationsView({
      actorUserId: guestId,
      applicationId,
    });
    expect(denied.ok).toBe(false);
  });

  it("assigned host can load operations view without mutating", async () => {
    const before = await db.arayanlarApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
    const ok = await getKariyerPortresiOperationsView({
      actorUserId: hostId,
      applicationId,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.view.nextAction.kind).toBe("action");
    if (ok.view.nextAction.kind === "action") {
      expect(ok.view.nextAction.action).toBe("host_handoff");
    }
    const after = await db.arayanlarApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.prepStatus).toBe(before.prepStatus);
    expect(after.recordingScheduleVersion).toBe(before.recordingScheduleVersion);
    expect(after.publicationReviewRequestedAt).toBe(before.publicationReviewRequestedAt);
  });

  it("admin can load operations view", async () => {
    const ok = await getKariyerPortresiOperationsView({
      actorUserId: adminId,
      applicationId,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.view.actor.isAdmin).toBe(true);
  });

  it("operations page uses derived read model and does not POST on render", () => {
    const page = readFileSync(
      path.join(root, "src/app/sunucu/basvurular/[id]/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/getKariyerPortresiOperationsView/);
    expect(page).toMatch(/KariyerPortresiOperationsOverview/);
    expect(page).not.toMatch(/sendKariyerPortresiHostHandoff/);
    expect(page).not.toMatch(/scheduleRecording\(/);
    expect(page).not.toMatch(/publishKariyerPortresiEpisode/);
  });
});
