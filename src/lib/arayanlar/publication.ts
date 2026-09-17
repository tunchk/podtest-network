import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { canMutateRecordingSchedule } from "@/lib/arayanlar/recording-schedule";
import {
  computeEpisodePublicationVersionId,
  ensureLegalDocumentsSeeded,
  hasCurrentAcceptance,
  recordAcceptance,
} from "@/lib/legal/service";
import { sanitizeExternalUrl } from "@/lib/security/urls";
import {
  notifyArayanlarPublicationApprovalRequested,
  notifyArayanlarPublished,
  notifyArayanlarPublicationChangeRequested,
} from "@/lib/arayanlar/notifications";

const CHANGE_NOTE_MAX = 500;
const SERIES_DEFAULT = "Kariyer Portresi";

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function slugifyTitle(title: string, salt: string) {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  const hash = createHash("sha256").update(salt).digest("hex").slice(0, 8);
  return `${base || "kariyer-portresi"}-${hash}`;
}

async function uniqueSlug(base: string) {
  let slug = base;
  let i = 0;
  for (;;) {
    const existing = await prisma.podcastEpisode.findUnique({ where: { slug } });
    if (!existing) return slug;
    i += 1;
    slug = `${base.slice(0, 60)}-${i}`;
  }
}

export type KariyerPublicationPreview = {
  episodeId: string;
  title: string;
  description: string | null;
  artworkUrl: string | null;
  publicationVersionId: string;
  publicationState: string;
  /** Canonical public path once published, e.g. /bolumler/slug */
  publicPath: string | null;
  listeningUrl: string | null;
};

export type KariyerPublicationCandidateState =
  | { kind: "none" }
  | {
      kind: "published";
      preview: KariyerPublicationPreview;
      publicUrl: string;
    }
  | {
      kind: "change_requested";
      preview: KariyerPublicationPreview;
      changeNote: string;
    }
  | {
      kind: "approval_requested";
      preview: KariyerPublicationPreview;
      alreadyApproved: boolean;
    };

function episodePreview(episode: {
  id: string;
  title: string;
  description: string | null;
  artworkUrl: string | null;
  audioUrl: string | null;
  listeningUrl: string | null;
  spotifyEpisodeUrl: string | null;
  publicationDate: Date | null;
  publicationState: string;
  slug: string;
}): KariyerPublicationPreview {
  const publicationVersionId = computeEpisodePublicationVersionId(episode);
  const published = episode.publicationState === "PUBLISHED";
  return {
    episodeId: episode.id,
    title: episode.title,
    description: episode.description,
    artworkUrl: episode.artworkUrl,
    publicationVersionId,
    publicationState: episode.publicationState,
    publicPath: published ? `/bolumler/${episode.slug}` : null,
    listeningUrl: episode.listeningUrl,
  };
}

function resolvePublicUrl(preview: KariyerPublicationPreview): string | null {
  if (preview.publicPath) return preview.publicPath;
  if (preview.listeningUrl) {
    const safe = sanitizeExternalUrl(preview.listeningUrl);
    return safe;
  }
  return null;
}

/**
 * Canonical current application for a member.
 * Domain: one ArayanlarApplication row per user (`userId` @unique); withdrawn reuses the same row.
 */
export async function findArayanlarApplicationForUser(userId: string) {
  return prisma.arayanlarApplication.findUnique({ where: { userId } });
}

async function loadApplicationWithPublicationEpisode(options: {
  candidateUserId: string;
  applicationId?: string;
}) {
  const app = options.applicationId
    ? await prisma.arayanlarApplication.findUnique({ where: { id: options.applicationId } })
    : await findArayanlarApplicationForUser(options.candidateUserId);

  if (!app || app.userId !== options.candidateUserId) {
    return null;
  }

  if (!app.publicationEpisodeId) {
    return { app, episode: null as null };
  }

  const episode = await prisma.podcastEpisode.findUnique({
    where: { id: app.publicationEpisodeId },
  });
  return { app, episode };
}

export async function getKariyerPublicationCandidateState(options: {
  candidateUserId: string;
  /** Prefer the caller's already-resolved application id (avoids a second userId unique lookup). */
  applicationId?: string;
}): Promise<KariyerPublicationCandidateState> {
  const loaded = await loadApplicationWithPublicationEpisode(options);
  if (!loaded?.episode) {
    return { kind: "none" };
  }

  const { app, episode } = loaded;
  const preview = episodePreview(episode);

  if (episode.publicationState === "PUBLISHED") {
    const publicUrl =
      resolvePublicUrl(preview) ??
      (episode.slug ? `/bolumler/${episode.slug}` : null);
    if (!publicUrl) {
      // Still surface published state — avoid falling back to prep/schedule cards.
      return {
        kind: "published",
        preview: { ...preview, publicPath: episode.slug ? `/bolumler/${episode.slug}` : null },
        publicUrl: episode.slug ? `/bolumler/${episode.slug}` : "/bolumler",
      };
    }
    return { kind: "published", preview, publicUrl };
  }

  if (!app.publicationReviewRequestedAt || !app.publicationReviewVersionId) {
    return { kind: "none" };
  }

  // Stale review if episode materially changed without re-send — still show, but approval will require match.
  if (app.publicationChangeRequestedAt && app.publicationChangeRequestNote) {
    return {
      kind: "change_requested",
      preview,
      changeNote: app.publicationChangeRequestNote,
    };
  }

  const currentVersionId = computeEpisodePublicationVersionId(episode);
  const versionMatchesReview = currentVersionId === app.publicationReviewVersionId;

  // Approval is only valid for the exact current episode version.
  const alreadyApproved =
    versionMatchesReview &&
    (await hasCurrentAcceptance({
      userId: options.candidateUserId,
      type: "PUBLICATION",
      documentType: "PUBLICATION_APPROVAL",
      relatedResourceType: "podcast_episode",
      relatedResourceId: episode.id,
      publicationVersionId: currentVersionId,
    }));

  return { kind: "approval_requested", preview, alreadyApproved };
}

/**
 * Staff/host: create or link a draft episode and request candidate publication approval.
 */
export async function sendKariyerPublicationForApproval(options: {
  actorUserId: string;
  applicationId: string;
  episodeId?: string | null;
  title?: string;
  description?: string | null;
  artworkUrl?: string | null;
  listeningUrl?: string | null;
}) {
  const access = await canMutateRecordingSchedule({
    actorUserId: options.actorUserId,
    applicationId: options.applicationId,
  });
  if (!access.ok) fail("FORBIDDEN", "Bu başvuru için yayın hazırlama yetkin yok.");

  const app = access.application;
  if (app.status !== "SUBMITTED" || app.prepStatus !== "READY") {
    fail("NOT_READY", "Yayın onayı yalnızca notlar hazırken başlatılabilir.");
  }

  await ensureLegalDocumentsSeeded();

  // Only reuse the application’s linked episode. Ignore foreign client episodeId on first send.
  const requestedId = options.episodeId?.trim() || null;
  if (
    requestedId &&
    app.publicationEpisodeId &&
    requestedId !== app.publicationEpisodeId
  ) {
    fail("EPISODE_FORBIDDEN", "Bu başvuruya yalnızca mevcut bağlı bölüm kullanılabilir.");
  }
  let episodeId = app.publicationEpisodeId || null;

  if (episodeId) {
    const existing = await prisma.podcastEpisode.findUnique({ where: { id: episodeId } });
    if (!existing) fail("EPISODE_NOT_FOUND", "Bölüm bulunamadı.");
    if (existing.publicationState === "PUBLISHED") {
      fail("ALREADY_PUBLISHED", "Yayımlanmış bölüm için yeni onay akışı açılamaz.");
    }
    // Apply optional metadata updates before computing version.
    if (
      options.title !== undefined ||
      options.description !== undefined ||
      options.artworkUrl !== undefined ||
      options.listeningUrl !== undefined
    ) {
      let listeningUrl = existing.listeningUrl;
      if (options.listeningUrl !== undefined) {
        if (options.listeningUrl?.trim()) {
          const safe = sanitizeExternalUrl(options.listeningUrl);
          if (!safe) fail("INVALID_URL", "Dinleme bağlantısı geçerli bir http(s) adresi olmalı.");
          listeningUrl = safe;
        } else {
          listeningUrl = null;
        }
      }
      await prisma.podcastEpisode.update({
        where: { id: episodeId },
        data: {
          ...(options.title !== undefined ? { title: options.title.trim() || existing.title } : {}),
          ...(options.description !== undefined
            ? { description: options.description?.trim() || null }
            : {}),
          ...(options.artworkUrl !== undefined
            ? { artworkUrl: options.artworkUrl?.trim() || null }
            : {}),
          listeningUrl,
        },
      });
    }
  } else {
    const title = (options.title?.trim() || "").trim();
    if (!title) fail("INVALID_INPUT", "Bölüm adı gerekli.");
    let listeningUrl: string | null = null;
    if (options.listeningUrl?.trim()) {
      listeningUrl = sanitizeExternalUrl(options.listeningUrl);
      if (!listeningUrl) fail("INVALID_URL", "Dinleme bağlantısı geçerli bir http(s) adresi olmalı.");
    }
    const slug = await uniqueSlug(
      slugifyTitle(title, `${app.id}:${title}:${Date.now()}`),
    );
    const created = await prisma.podcastEpisode.create({
      data: {
        series: SERIES_DEFAULT,
        title,
        slug,
        description: options.description?.trim() || null,
        artworkUrl: options.artworkUrl?.trim() || null,
        listeningUrl,
        publicationState: "DRAFT",
        sourceKind: "MANUAL",
        createdById: options.actorUserId,
      },
    });
    episodeId = created.id;
  }

  const episode = await prisma.podcastEpisode.findUniqueOrThrow({ where: { id: episodeId } });
  const publicationVersionId = computeEpisodePublicationVersionId(episode);

  // Ensure publish gate will require this candidate's publication approval.
  // Do not forge memberAcceptedAt — publication LegalAcceptance is the candidate action.
  await prisma.episodeAppearance.upsert({
    where: {
      episodeId_memberUserId: {
        episodeId,
        memberUserId: app.userId,
      },
    },
    create: {
      episodeId,
      memberUserId: app.userId,
      status: "CONFIRMED",
      requestedBy: "ADMIN",
      proposedById: options.actorUserId,
      adminVerifiedAt: new Date(),
      memberAcceptedAt: null,
      creditLabel: "Kariyer Portresi",
    },
    update: {
      status: "CONFIRMED",
      revokedAt: null,
      rejectedAt: null,
      adminVerifiedAt: new Date(),
      // Preserve an existing memberAcceptedAt; never invent one here.
    },
  });

  const unchanged =
    app.publicationEpisodeId === episodeId &&
    app.publicationReviewVersionId === publicationVersionId &&
    app.publicationReviewRequestedAt != null &&
    !app.publicationChangeRequestedAt;

  const updated = await prisma.arayanlarApplication.update({
    where: { id: app.id },
    data: {
      publicationEpisodeId: episodeId,
      publicationReviewRequestedAt: new Date(),
      publicationReviewVersionId: publicationVersionId,
      publicationChangeRequestNote: null,
      publicationChangeRequestedAt: null,
    },
  });

  if (!unchanged) {
    await notifyArayanlarPublicationApprovalRequested({
      userId: app.userId,
      applicationId: app.id,
      publicationVersionId,
    });
  }

  return {
    application: updated,
    episode,
    publicationVersionId,
    changed: !unchanged,
  };
}

export async function approveKariyerPublication(options: {
  candidateUserId: string;
}) {
  await ensureLegalDocumentsSeeded();
  const loaded = await loadApplicationWithPublicationEpisode({
    candidateUserId: options.candidateUserId,
  });
  if (
    !loaded?.episode ||
    !loaded.app.publicationReviewRequestedAt ||
    !loaded.app.publicationReviewVersionId
  ) {
    fail("NOT_READY", "Onaylanacak bir yayın sürümü yok.");
  }
  const { app, episode } = loaded;
  if (episode.publicationState === "PUBLISHED") {
    fail("ALREADY_PUBLISHED", "Bölüm zaten yayında.");
  }

  const currentVersionId = computeEpisodePublicationVersionId(episode);
  if (currentVersionId !== app.publicationReviewVersionId) {
    fail(
      "VERSION_MISMATCH",
      "Yayın sürümü güncellendi. Lütfen sayfayı yenileyip yeni sürümü kontrol et.",
    );
  }

  const already = await hasCurrentAcceptance({
    userId: options.candidateUserId,
    type: "PUBLICATION",
    documentType: "PUBLICATION_APPROVAL",
    relatedResourceType: "podcast_episode",
    relatedResourceId: episode.id,
    publicationVersionId: currentVersionId,
  });
  if (already) {
    return { created: false as const, publicationVersionId: currentVersionId };
  }

  await recordAcceptance({
    userId: options.candidateUserId,
    type: "PUBLICATION",
    documentType: "PUBLICATION_APPROVAL",
    scope: "kariyer_portresi_publication",
    relatedResourceType: "podcast_episode",
    relatedResourceId: episode.id,
    metadata: {
      publicationVersionId: currentVersionId,
      applicationId: app.id,
    },
  });

  // Clear change-request state if any leftover.
  if (app.publicationChangeRequestedAt) {
    await prisma.arayanlarApplication.update({
      where: { id: app.id },
      data: {
        publicationChangeRequestNote: null,
        publicationChangeRequestedAt: null,
      },
    });
  }

  return { created: true as const, publicationVersionId: currentVersionId };
}

export async function requestKariyerPublicationChanges(options: {
  candidateUserId: string;
  note: string;
}) {
  const note = options.note.trim();
  if (!note) fail("NOTE_REQUIRED", "Ne değiştirilmesini istediğini yaz.");
  if (note.length > CHANGE_NOTE_MAX) {
    fail("NOTE_TOO_LONG", `Not en fazla ${CHANGE_NOTE_MAX} karakter olabilir.`);
  }

  const loaded = await loadApplicationWithPublicationEpisode({
    candidateUserId: options.candidateUserId,
  });
  if (!loaded?.episode || !loaded.app.publicationReviewRequestedAt) {
    fail("NOT_READY", "Değişiklik istenebilecek bir yayın sürümü yok.");
  }
  const { app, episode } = loaded;
  if (episode.publicationState === "PUBLISHED") {
    fail("ALREADY_PUBLISHED", "Bölüm zaten yayında.");
  }

  const updated = await prisma.arayanlarApplication.update({
    where: { id: app.id },
    data: {
      publicationChangeRequestNote: note,
      publicationChangeRequestedAt: new Date(),
    },
  });

  // Notify assigned host if present; otherwise skip (no complex assignment invented).
  if (app.assignedHostUserId) {
    await notifyArayanlarPublicationChangeRequested({
      hostUserId: app.assignedHostUserId,
      applicationId: app.id,
      publicationVersionId: app.publicationReviewVersionId ?? "unknown",
    });
  }

  return updated;
}

/**
 * Publish linked Kariyer Portresi episode — requires candidate approval for current version.
 * Reuses updatePodcastEpisode gate; maps error to PUBLICATION_APPROVAL_REQUIRED.
 */
export async function publishKariyerPortresiEpisode(options: {
  actorUserId: string;
  applicationId: string;
}) {
  const access = await canMutateRecordingSchedule({
    actorUserId: options.actorUserId,
    applicationId: options.applicationId,
  });
  if (!access.ok) fail("FORBIDDEN", "Yayınlama yetkin yok.");

  const app = await prisma.arayanlarApplication.findUnique({
    where: { id: options.applicationId },
  });
  if (!app?.publicationEpisodeId) {
    fail("NOT_READY", "Bağlı bir bölüm yok.");
  }
  const episode = await prisma.podcastEpisode.findUnique({
    where: { id: app.publicationEpisodeId },
  });
  if (!episode) {
    fail("NOT_READY", "Bağlı bir bölüm yok.");
  }
  if (episode.publicationState === "PUBLISHED") {
    fail("ALREADY_PUBLISHED", "Bölüm zaten yayında.");
  }

  const actor = await prisma.user.findUnique({
    where: { id: options.actorUserId },
    select: { staffRole: true },
  });
  // updatePodcastEpisode requires ADMIN
  if (!actor || actor.staffRole !== "ADMIN") {
    fail("FORBIDDEN", "Bölümü yayına almak için yönetim yetkisi gerekir.");
  }

  const versionId = computeEpisodePublicationVersionId(episode);
  const approved = await hasCurrentAcceptance({
    userId: app.userId,
    type: "PUBLICATION",
    documentType: "PUBLICATION_APPROVAL",
    relatedResourceType: "podcast_episode",
    relatedResourceId: episode.id,
    publicationVersionId: versionId,
  });
  if (!approved) {
    fail(
      "PUBLICATION_APPROVAL_REQUIRED",
      "Bu yayın versiyonu henüz aday tarafından onaylanmadı.",
    );
  }

  const { updatePodcastEpisode } = await import("@/lib/community/episodes");
  try {
    // Do not change title/description/urls/publicationDate here — those alter
    // computeEpisodePublicationVersionId and would invalidate the candidate's approval.
    const published = await updatePodcastEpisode({
      adminId: options.actorUserId,
      episodeId: episode.id,
      publicationState: "PUBLISHED",
    });

    await notifyArayanlarPublished({
      userId: app.userId,
      applicationId: app.id,
      episodeId: published.id,
      publicationVersionId: versionId,
    });

    return published;
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: string }).code)
        : error instanceof Error
          ? error.message
          : "PUBLISH_FAILED";
    if (code === "LEGAL_PUBLICATION_REQUIRED") {
      fail(
        "PUBLICATION_APPROVAL_REQUIRED",
        "Bu yayın versiyonu henüz aday tarafından onaylanmadı.",
      );
    }
    throw error;
  }
}
