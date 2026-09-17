/**
 * Derived Kariyer Portresi operations view for staff/host.
 * No new lifecycle enum — state is computed from existing source-of-truth fields.
 */

import { prisma } from "@/lib/db";
import { canMutateRecordingSchedule } from "@/lib/arayanlar/recording-schedule";
import { toRecordingScheduleView } from "@/lib/arayanlar/recording-schedule";
import {
  hostHandoffIdempotencyKey,
  hostPrepNotesPath,
  resolveDefaultKariyerPortresiHost,
} from "@/lib/arayanlar/default-host";
import {
  computeEpisodePublicationVersionId,
  hasCurrentAcceptance,
} from "@/lib/legal/service";
import type { SubmittedFacts } from "@/lib/arayanlar/constants";
import type { ArayanlarApplication, PodcastEpisode } from "@/generated/prisma/client";

export type OpsStepStatus = "tamamlandi" | "bekliyor" | "islem_gerekiyor" | "mevcut_degil";

export type OpsProgressStep = {
  id: "basvuru" | "hazirlik" | "host" | "kayit" | "yayin_onayi" | "yayin";
  label: string;
  status: OpsStepStatus;
  detail?: string;
};

export type OpsNextAction =
  | { kind: "wait"; label: string; detail?: string }
  | { kind: "info"; label: string; detail?: string }
  | {
      kind: "action";
      label: string;
      detail?: string;
      action:
        | "host_handoff"
        | "schedule"
        | "send_publication_review"
        | "review_change_request"
        | "publish"
        | "open_notes";
    }
  | { kind: "done"; label: string; href?: string };

export type OpsActivityItem = {
  id: string;
  label: string;
  at: Date;
};

export type KariyerPortresiOperationsView = {
  applicationId: string;
  candidate: {
    userId: string;
    name: string;
    email: string;
    displayName: string;
    targetRole: string | null;
  };
  applicationStatusLabel: string;
  primaryLabel: string;
  latestTimestamp: Date | null;
  progress: OpsProgressStep[];
  nextAction: OpsNextAction;
  preparation: {
    label: string;
    prepStatus: string;
    ready: boolean;
    notesExist: boolean;
    templateVersion: string | null;
    artifactUpdatedAt: Date | null;
    submittedAt: Date | null;
    notesPath: string;
    failed: boolean;
    retryable: boolean;
  };
  hostHandoff: {
    defaultHostConfigured: boolean;
    defaultHostName: string | null;
    defaultHostAuthorized: boolean;
    assignedHostName: string | null;
    sent: boolean;
    sentAt: Date | null;
    canResend: boolean;
  };
  recording: ReturnType<typeof toRecordingScheduleView> & {
    scheduledByName: string | null;
    updatedAt: Date | null;
  };
  publication: {
    episodeId: string | null;
    title: string | null;
    description: string | null;
    slug: string | null;
    publicationState: string | null;
    reviewRequested: boolean;
    reviewRequestedAt: Date | null;
    reviewVersionId: string | null;
    currentVersionId: string | null;
    versionMatchesReview: boolean;
    candidateDecision: "none" | "waiting" | "approved" | "change_requested";
    changeNote: string | null;
    changeRequestedAt: Date | null;
    approvedAt: Date | null;
    alreadyApprovedCurrent: boolean;
    publicPath: string | null;
    canPublish: boolean;
    publishBlockedReason: string | null;
  };
  activity: OpsActivityItem[];
  issues: string[];
  actor: { isAdmin: boolean; as: "admin" | "host" };
  facts: SubmittedFacts | null;
};

function applicationStatusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Taslak";
    case "AWAITING_CONFIRMATION":
      return "Onay bekliyor";
    case "SUBMITTED":
      return "Gönderildi";
    case "WITHDRAWN":
      return "Geri çekildi";
    default:
      return "İşlemde";
  }
}

function stepLabel(status: OpsStepStatus) {
  switch (status) {
    case "tamamlandi":
      return "tamamlandı";
    case "bekliyor":
      return "bekliyor";
    case "islem_gerekiyor":
      return "işlem gerekiyor";
    case "mevcut_degil":
      return "mevcut değil";
  }
}

export function opsStepStatusLabel(status: OpsStepStatus) {
  return stepLabel(status);
}

type DeriveInput = {
  app: ArayanlarApplication;
  candidateName: string;
  candidateEmail: string;
  hostPackExists: boolean;
  artifactUpdatedAt: Date | null;
  prepJob: { status: string; attemptCount: number; maxAttempts: number } | null;
  defaultHost: Awaited<ReturnType<typeof resolveDefaultKariyerPortresiHost>>;
  assignedHostName: string | null;
  handoffMessage: { createdAt: Date } | null;
  scheduledByName: string | null;
  episode: PodcastEpisode | null;
  alreadyApprovedCurrent: boolean;
  approvedAt: Date | null;
  actorIsAdmin: boolean;
  actorAs: "admin" | "host";
};

/** Pure derivation — unit-testable without DB. */
export function deriveKariyerPortresiOperations(input: DeriveInput): KariyerPortresiOperationsView {
  const { app, episode } = input;
  const facts = (app.submittedFacts as SubmittedFacts | null) ?? null;
  const schedule = toRecordingScheduleView(app);
  const prepReady = app.status === "SUBMITTED" && app.prepStatus === "READY" && input.hostPackExists;
  const prepFailed = app.prepStatus === "FAILED";
  const prepWaiting =
    app.status === "SUBMITTED" &&
    (app.prepStatus === "QUEUED" || app.prepStatus === "RUNNING" || app.prepStatus === "NOT_STARTED");
  const retryable =
    prepFailed &&
    Boolean(input.prepJob) &&
    (input.prepJob?.attemptCount ?? 0) < (input.prepJob?.maxAttempts ?? 0);

  const handoffSent = Boolean(input.handoffMessage);
  const reviewRequested = Boolean(app.publicationReviewRequestedAt && app.publicationReviewVersionId);
  const changeRequested = Boolean(app.publicationChangeRequestedAt && app.publicationChangeRequestNote);
  const currentVersionId = episode ? computeEpisodePublicationVersionId(episode) : null;
  const versionMatchesReview =
    Boolean(currentVersionId) &&
    Boolean(app.publicationReviewVersionId) &&
    currentVersionId === app.publicationReviewVersionId;
  const published = episode?.publicationState === "PUBLISHED";
  const approvedCurrent = input.alreadyApprovedCurrent && versionMatchesReview;

  // --- progress ---
  const basvuru: OpsProgressStep = {
    id: "basvuru",
    label: "Başvuru",
    status:
      app.status === "WITHDRAWN"
        ? "mevcut_degil"
        : app.status === "SUBMITTED" || app.submittedAt
          ? "tamamlandi"
          : app.status === "DRAFT" || app.status === "AWAITING_CONFIRMATION"
            ? "bekliyor"
            : "mevcut_degil",
    detail: app.status === "WITHDRAWN" ? "Başvuru geri çekildi" : undefined,
  };

  let hazirlik: OpsProgressStep;
  if (prepReady) {
    hazirlik = { id: "hazirlik", label: "Hazırlık", status: "tamamlandi", detail: "Notlar hazır" };
  } else if (prepFailed) {
    hazirlik = {
      id: "hazirlik",
      label: "Hazırlık",
      status: "islem_gerekiyor",
      detail: retryable ? "Yeniden denenebilir" : "Hazırlık tamamlanamadı",
    };
  } else if (prepWaiting) {
    hazirlik = { id: "hazirlik", label: "Hazırlık", status: "bekliyor", detail: "Notlar hazırlanıyor" };
  } else {
    hazirlik = { id: "hazirlik", label: "Hazırlık", status: "mevcut_degil" };
  }

  let hostStep: OpsProgressStep;
  if (!prepReady) {
    hostStep = { id: "host", label: "Host hazırlığı", status: "mevcut_degil" };
  } else if (handoffSent) {
    hostStep = { id: "host", label: "Host hazırlığı", status: "tamamlandi", detail: "Host’a iletildi" };
  } else {
    hostStep = {
      id: "host",
      label: "Host hazırlığı",
      status: "islem_gerekiyor",
      detail: "Host’a henüz gönderilmedi",
    };
  }

  let kayit: OpsProgressStep;
  if (!prepReady) {
    kayit = { id: "kayit", label: "Kayıt planı", status: "mevcut_degil" };
  } else if (schedule.scheduled) {
    kayit = {
      id: "kayit",
      label: "Kayıt planı",
      status: "tamamlandi",
      detail: schedule.displayWhen ?? undefined,
    };
  } else if (app.recordingScheduleVersion > 0) {
    kayit = {
      id: "kayit",
      label: "Kayıt planı",
      status: "islem_gerekiyor",
      detail: "Plan iptal edildi — yeni zaman bekleniyor",
    };
  } else {
    kayit = { id: "kayit", label: "Kayıt planı", status: "bekliyor", detail: "Zaman belirlenmedi" };
  }

  let yayinOnayi: OpsProgressStep;
  if (published) {
    yayinOnayi = { id: "yayin_onayi", label: "Yayın onayı", status: "tamamlandi", detail: "Onaylandı" };
  } else if (changeRequested) {
    yayinOnayi = {
      id: "yayin_onayi",
      label: "Yayın onayı",
      status: "islem_gerekiyor",
      detail: "Aday değişiklik istedi",
    };
  } else if (approvedCurrent) {
    yayinOnayi = { id: "yayin_onayi", label: "Yayın onayı", status: "tamamlandi", detail: "Aday onayladı" };
  } else if (reviewRequested && versionMatchesReview) {
    yayinOnayi = { id: "yayin_onayi", label: "Yayın onayı", status: "bekliyor", detail: "Aday onayı bekleniyor" };
  } else if (reviewRequested && !versionMatchesReview) {
    yayinOnayi = {
      id: "yayin_onayi",
      label: "Yayın onayı",
      status: "islem_gerekiyor",
      detail: "Sürüm değişti — yeniden onay gerekli",
    };
  } else if (episode) {
    yayinOnayi = {
      id: "yayin_onayi",
      label: "Yayın onayı",
      status: "islem_gerekiyor",
      detail: "Onaya gönderilmedi",
    };
  } else {
    yayinOnayi = { id: "yayin_onayi", label: "Yayın onayı", status: "mevcut_degil" };
  }

  let yayin: OpsProgressStep;
  if (published) {
    yayin = { id: "yayin", label: "Yayın", status: "tamamlandi", detail: "Yayında" };
  } else if (approvedCurrent) {
    yayin = {
      id: "yayin",
      label: "Yayın",
      status: "islem_gerekiyor",
      detail: "Onaylı — yayına alınabilir",
    };
  } else if (reviewRequested) {
    yayin = { id: "yayin", label: "Yayın", status: "bekliyor", detail: "Onay bekleniyor" };
  } else {
    yayin = { id: "yayin", label: "Yayın", status: "mevcut_degil" };
  }

  const progress = [basvuru, hazirlik, hostStep, kayit, yayinOnayi, yayin];

  // --- next action ---
  let nextAction: OpsNextAction;
  if (app.status === "WITHDRAWN") {
    nextAction = { kind: "info", label: "Başvuru geri çekildi" };
  } else if (published) {
    nextAction = {
      kind: "done",
      label: "Yayınlandı",
      href: episode?.slug ? `/bolumler/${episode.slug}` : undefined,
    };
  } else if (prepFailed) {
    nextAction = {
      kind: "wait",
      label: retryable ? "Hazırlık başarısız — aday yeniden deneyebilir" : "Hazırlık tamamlanamadı",
    };
  } else if (prepWaiting) {
    nextAction = { kind: "wait", label: "Hazırlık notlarını bekliyor" };
  } else if (prepReady && !handoffSent) {
    nextAction = {
      kind: "action",
      label: "Host'a gönder",
      detail: "Hazırlık notları hosta iletilmeli.",
      action: "host_handoff",
    };
  } else if (prepReady && !schedule.scheduled) {
    nextAction = {
      kind: "action",
      label: "Kayıt zamanını belirle",
      action: "schedule",
    };
  } else if (prepReady && schedule.scheduled && !episode) {
    nextAction = {
      kind: "info",
      label: "Kayıt sonrası yayın versiyonu hazırlanacak",
      detail: "Kayıt tamamlandıktan sonra yayın sürümünü burada hazırlayabilirsin.",
    };
  } else if (changeRequested) {
    nextAction = {
      kind: "action",
      label: "Değişiklik talebini incele",
      detail: app.publicationChangeRequestNote ?? undefined,
      action: "review_change_request",
    };
  } else if (episode && (!reviewRequested || !versionMatchesReview)) {
    nextAction = {
      kind: "action",
      label: "Yayın onayına gönder",
      detail: !versionMatchesReview && reviewRequested ? "Sürüm değişti." : undefined,
      action: "send_publication_review",
    };
  } else if (reviewRequested && versionMatchesReview && !approvedCurrent) {
    nextAction = { kind: "wait", label: "Aday yayın onayı bekleniyor" };
  } else if (approvedCurrent && input.actorIsAdmin) {
    nextAction = {
      kind: "action",
      label: "Yayına al",
      action: "publish",
    };
  } else if (approvedCurrent) {
    nextAction = {
      kind: "info",
      label: "Aday onayladı — yayına alma için yönetim yetkisi gerekir",
    };
  } else {
    nextAction = {
      kind: "action",
      label: "Host notlarını aç",
      action: "open_notes",
    };
  }

  // --- primary label ---
  let primaryLabel = "İşlemde";
  if (published) primaryLabel = "Kariyer Portresi yayında";
  else if (changeRequested) primaryLabel = "Değişiklik istendi";
  else if (approvedCurrent) primaryLabel = "Aday onayladı";
  else if (reviewRequested && versionMatchesReview) primaryLabel = "Yayın onayı bekleniyor";
  else if (schedule.scheduled) primaryLabel = "Kayıt planlandı";
  else if (prepReady) primaryLabel = "Hazırlık tamam";
  else if (prepFailed) primaryLabel = "Hazırlık sorunu";
  else if (prepWaiting) primaryLabel = "Hazırlık sürüyor";
  else if (app.status === "WITHDRAWN") primaryLabel = "Geri çekildi";

  // --- preparation label ---
  let prepLabel = "Başlamadı";
  if (prepReady) prepLabel = "Hazır";
  else if (prepFailed) prepLabel = retryable ? "Başarısız (yeniden denenebilir)" : "Başarısız";
  else if (app.prepStatus === "QUEUED") prepLabel = "Sırada";
  else if (app.prepStatus === "RUNNING") prepLabel = "Oluşturuluyor";

  // --- publication decision ---
  let candidateDecision: KariyerPortresiOperationsView["publication"]["candidateDecision"] = "none";
  if (published || approvedCurrent) candidateDecision = "approved";
  else if (changeRequested) candidateDecision = "change_requested";
  else if (reviewRequested && versionMatchesReview) candidateDecision = "waiting";

  const canPublish = approvedCurrent && input.actorIsAdmin && !published;
  const publishBlockedReason = published
    ? null
    : !approvedCurrent
      ? "Bu yayın versiyonu henüz aday tarafından onaylanmadı."
      : !input.actorIsAdmin
        ? "Yayına alma için yönetim yetkisi gerekir."
        : null;

  // --- activity ---
  const activity: OpsActivityItem[] = [];
  if (app.submittedAt) {
    activity.push({ id: "submitted", label: "Başvuru gönderildi", at: app.submittedAt });
  }
  if (prepReady && input.artifactUpdatedAt) {
    activity.push({ id: "prep_ready", label: "Hazırlık notları hazır", at: input.artifactUpdatedAt });
  }
  if (input.handoffMessage) {
    activity.push({ id: "handoff", label: "Host’a mesaj gönderildi", at: input.handoffMessage.createdAt });
  }
  if (app.recordingScheduleUpdatedAt && schedule.scheduled) {
    activity.push({
      id: "scheduled",
      label: "Kayıt zamanı belirlendi / güncellendi",
      at: app.recordingScheduleUpdatedAt,
    });
  } else if (app.recordingScheduleUpdatedAt && app.recordingScheduleVersion > 0 && !schedule.scheduled) {
    activity.push({
      id: "schedule_cancelled",
      label: "Kayıt planı iptal edildi",
      at: app.recordingScheduleUpdatedAt,
    });
  }
  if (app.publicationReviewRequestedAt) {
    activity.push({
      id: "review_requested",
      label: "Yayın onayına gönderildi",
      at: app.publicationReviewRequestedAt,
    });
  }
  if (input.approvedAt) {
    activity.push({ id: "approved", label: "Aday yayın onayını verdi", at: input.approvedAt });
  }
  if (app.publicationChangeRequestedAt) {
    activity.push({
      id: "change_requested",
      label: "Aday değişiklik istedi",
      at: app.publicationChangeRequestedAt,
    });
  }
  if (published && episode?.updatedAt) {
    activity.push({ id: "published", label: "Bölüm yayınlandı", at: episode.updatedAt });
  }
  activity.sort((a, b) => b.at.getTime() - a.at.getTime());

  // --- issues ---
  const issues: string[] = [];
  if (prepFailed) {
    issues.push(
      retryable
        ? "Hazırlık notları oluşturulamadı; aday ücretsiz yeniden deneyebilir."
        : "Hazırlık notları oluşturulamadı.",
    );
  }
  if (!input.defaultHost.ok) {
    issues.push("Varsayılan host yapılandırılmamış veya yetkili değil.");
  }
  if (prepReady && !input.hostPackExists) {
    issues.push("Hazırlık READY görünüyor ama host notları bulunamadı.");
  }
  if (schedule.scheduled && !schedule.timeZone) {
    issues.push("Kayıt zamanı var ama saat dilimi eksik.");
  }
  if (reviewRequested && episode && !versionMatchesReview) {
    issues.push("Bölüm içeriği onay sürümünden sonra değişti; yeniden onay gerekli.");
  }
  if (published && !episode?.slug) {
    issues.push("Yayın durumu var ama herkese açık bölüm adresi eksik.");
  }

  const latestTimestamp = activity[0]?.at ?? app.updatedAt;

  return {
    applicationId: app.id,
    candidate: {
      userId: app.userId,
      name: input.candidateName,
      email: input.candidateEmail,
      displayName: facts?.displayName?.trim() || input.candidateName,
      targetRole: facts?.targetRole?.trim() || null,
    },
    applicationStatusLabel: applicationStatusLabel(app.status),
    primaryLabel,
    latestTimestamp,
    progress,
    nextAction,
    preparation: {
      label: prepLabel,
      prepStatus: app.prepStatus,
      ready: prepReady,
      notesExist: input.hostPackExists,
      templateVersion: app.editorialTemplateVersion,
      artifactUpdatedAt: input.artifactUpdatedAt,
      submittedAt: app.submittedAt,
      notesPath: hostPrepNotesPath(app.id),
      failed: prepFailed,
      retryable,
    },
    hostHandoff: {
      defaultHostConfigured: input.defaultHost.ok,
      defaultHostName: input.defaultHost.ok ? input.defaultHost.name : null,
      defaultHostAuthorized: input.defaultHost.ok,
      assignedHostName: input.assignedHostName,
      sent: handoffSent,
      sentAt: input.handoffMessage?.createdAt ?? null,
      canResend: prepReady && handoffSent,
    },
    recording: {
      ...schedule,
      scheduledByName: input.scheduledByName,
      updatedAt: app.recordingScheduleUpdatedAt,
    },
    publication: {
      episodeId: episode?.id ?? null,
      title: episode?.title ?? null,
      description: episode?.description ?? null,
      slug: episode?.slug ?? null,
      publicationState: episode?.publicationState ?? null,
      reviewRequested,
      reviewRequestedAt: app.publicationReviewRequestedAt,
      reviewVersionId: app.publicationReviewVersionId,
      currentVersionId,
      versionMatchesReview,
      candidateDecision,
      changeNote: app.publicationChangeRequestNote,
      changeRequestedAt: app.publicationChangeRequestedAt,
      approvedAt: input.approvedAt,
      alreadyApprovedCurrent: approvedCurrent,
      publicPath: published && episode?.slug ? `/bolumler/${episode.slug}` : null,
      canPublish,
      publishBlockedReason,
    },
    activity,
    issues,
    actor: { isAdmin: input.actorIsAdmin, as: input.actorAs },
    facts,
  };
}

export async function getKariyerPortresiOperationsView(options: {
  actorUserId: string;
  applicationId: string;
}): Promise<{ ok: true; view: KariyerPortresiOperationsView } | { ok: false; reason: string }> {
  const access = await canMutateRecordingSchedule({
    actorUserId: options.actorUserId,
    applicationId: options.applicationId,
  });
  if (!access.ok) {
    return { ok: false, reason: access.reason };
  }

  const app = await prisma.arayanlarApplication.findUnique({
    where: { id: options.applicationId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      assignedHost: { select: { id: true, name: true } },
      recordingScheduledBy: { select: { id: true, name: true } },
      publicationEpisode: true,
    },
  });
  if (!app) return { ok: false, reason: "not_found" };

  const artifact = app.submittedRevision >= 1
    ? await prisma.arayanlarArtifact.findUnique({
        where: {
          applicationId_kind_submittedRevision: {
            applicationId: app.id,
            kind: "HOST_PACK",
            submittedRevision: app.submittedRevision,
          },
        },
        select: { id: true, updatedAt: true },
      })
    : null;

  let prepJob: DeriveInput["prepJob"] = null;
  if (app.prepareJobId) {
    prepJob = await prisma.aiJob.findUnique({
      where: { id: app.prepareJobId },
      select: { status: true, attemptCount: true, maxAttempts: true },
    });
  }

  const defaultHost = await resolveDefaultKariyerPortresiHost();

  let handoffMessage: { createdAt: Date } | null = null;
  if (defaultHost.ok && app.submittedRevision >= 1) {
    const key = hostHandoffIdempotencyKey({
      applicationId: app.id,
      revision: app.submittedRevision,
      hostUserId: defaultHost.userId,
    });
    handoffMessage = await prisma.directMessage.findFirst({
      where: { senderId: app.userId, idempotencyKey: key },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  let alreadyApprovedCurrent = false;
  let approvedAt: Date | null = null;
  if (app.publicationEpisode) {
    const versionId = computeEpisodePublicationVersionId(app.publicationEpisode);
    alreadyApprovedCurrent = await hasCurrentAcceptance({
      userId: app.userId,
      type: "PUBLICATION",
      documentType: "PUBLICATION_APPROVAL",
      relatedResourceType: "podcast_episode",
      relatedResourceId: app.publicationEpisode.id,
      publicationVersionId: versionId,
    });
    if (alreadyApprovedCurrent) {
      const row = await prisma.legalAcceptance.findFirst({
        where: {
          userId: app.userId,
          type: "PUBLICATION",
          relatedResourceType: "podcast_episode",
          relatedResourceId: app.publicationEpisode.id,
          withdrawnAt: null,
        },
        orderBy: { acceptedAt: "desc" },
      });
      const meta = row?.metadata as { publicationVersionId?: string } | null;
      if (row && meta?.publicationVersionId === versionId) {
        approvedAt = row.acceptedAt;
      }
    }
  }

  const view = deriveKariyerPortresiOperations({
    app,
    candidateName: app.user.name,
    candidateEmail: app.user.email,
    hostPackExists: Boolean(artifact),
    artifactUpdatedAt: artifact?.updatedAt ?? null,
    prepJob,
    defaultHost,
    assignedHostName: app.assignedHost?.name ?? null,
    handoffMessage,
    scheduledByName: app.recordingScheduledBy?.name ?? null,
    episode: app.publicationEpisode,
    alreadyApprovedCurrent,
    approvedAt,
    actorIsAdmin: access.as === "admin",
    actorAs: access.as,
  });

  return { ok: true, view };
}
