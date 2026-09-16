import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { sanitizeExternalUrl } from "@/lib/security/urls";
import { sanitizeSpotifyEpisodeUrl, mergeManualOverrides } from "@/lib/podcast/sanitize";
import type { PodcastEpisodePublicationState } from "@/generated/prisma/client";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

async function requireAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { staffRole: true },
  });
  if (!user || user.staffRole !== "ADMIN") fail("FORBIDDEN");
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
  return `${base || "bolum"}-${hash}`;
}

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = base;
  let i = 0;
  for (;;) {
    const existing = await prisma.podcastEpisode.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    i += 1;
    slug = `${base.slice(0, 60)}-${i}`;
  }
}

export async function createPodcastEpisode(options: {
  adminId: string;
  series: string;
  title: string;
  description?: string | null;
  publicationDate?: Date | null;
  listeningUrl?: string | null;
  spotifyEpisodeUrl?: string | null;
  artworkUrl?: string | null;
  audioUrl?: string | null;
  publicationState?: PodcastEpisodePublicationState;
}) {
  await requireAdmin(options.adminId);
  const series = options.series.trim();
  const title = options.title.trim();
  if (!series || !title) fail("INVALID_INPUT");
  let listeningUrl: string | null = null;
  if (options.listeningUrl?.trim()) {
    listeningUrl = sanitizeExternalUrl(options.listeningUrl);
    if (!listeningUrl) fail("INVALID_URL");
  }
  let spotifyEpisodeUrl: string | null = null;
  if (options.spotifyEpisodeUrl?.trim()) {
    spotifyEpisodeUrl = sanitizeSpotifyEpisodeUrl(options.spotifyEpisodeUrl);
    if (!spotifyEpisodeUrl) fail("INVALID_SPOTIFY_URL");
  }
  const slug = await uniqueSlug(slugifyTitle(title, `${series}:${title}:${Date.now()}`));
  return prisma.podcastEpisode.create({
    data: {
      series,
      title,
      slug,
      description: options.description?.trim() || null,
      publicationDate: options.publicationDate ?? null,
      listeningUrl,
      spotifyEpisodeUrl,
      artworkUrl: options.artworkUrl?.trim() || null,
      audioUrl: options.audioUrl?.trim() || null,
      publicationState: options.publicationState ?? "DRAFT",
      sourceKind: "MANUAL",
      createdById: options.adminId,
    },
  });
}

export async function updatePodcastEpisode(options: {
  adminId: string;
  episodeId: string;
  series?: string;
  title?: string;
  description?: string | null;
  publicationDate?: Date | null;
  listeningUrl?: string | null;
  spotifyEpisodeUrl?: string | null;
  artworkUrl?: string | null;
  audioUrl?: string | null;
  publicationState?: PodcastEpisodePublicationState;
}) {
  await requireAdmin(options.adminId);
  const existing = await prisma.podcastEpisode.findUnique({ where: { id: options.episodeId } });
  if (!existing) fail("NOT_FOUND");

  let listeningUrl = options.listeningUrl;
  if (listeningUrl !== undefined && listeningUrl !== null && listeningUrl.trim()) {
    const safe = sanitizeExternalUrl(listeningUrl);
    if (!safe) fail("INVALID_URL");
    listeningUrl = safe;
  } else if (listeningUrl !== undefined && (!listeningUrl || !listeningUrl.trim())) {
    listeningUrl = null;
  }

  let spotifyEpisodeUrl = options.spotifyEpisodeUrl;
  if (spotifyEpisodeUrl !== undefined && spotifyEpisodeUrl !== null && spotifyEpisodeUrl.trim()) {
    const safe = sanitizeSpotifyEpisodeUrl(spotifyEpisodeUrl);
    if (!safe) fail("INVALID_SPOTIFY_URL");
    spotifyEpisodeUrl = safe;
  } else if (spotifyEpisodeUrl !== undefined && (!spotifyEpisodeUrl || !spotifyEpisodeUrl.trim())) {
    spotifyEpisodeUrl = null;
  }

  const changed: string[] = [];
  if (options.series !== undefined) changed.push("series");
  if (options.title !== undefined) changed.push("title");
  if (options.description !== undefined) changed.push("description");
  if (options.publicationDate !== undefined) changed.push("publicationDate");
  if (listeningUrl !== undefined) changed.push("listeningUrl");
  if (spotifyEpisodeUrl !== undefined) changed.push("spotifyEpisodeUrl");
  if (options.artworkUrl !== undefined) changed.push("artworkUrl");
  if (options.audioUrl !== undefined) changed.push("audioUrl");
  if (options.publicationState !== undefined) changed.push("publicationState");

  const nextState = options.publicationState ?? existing.publicationState;
  const becomingPublished =
    nextState === "PUBLISHED" && existing.publicationState !== "PUBLISHED";
  const materialWhilePublished =
    existing.publicationState === "PUBLISHED" &&
    nextState === "PUBLISHED" &&
    (options.title !== undefined ||
      options.description !== undefined ||
      options.audioUrl !== undefined ||
      listeningUrl !== undefined ||
      spotifyEpisodeUrl !== undefined ||
      options.publicationDate !== undefined);

  if (becomingPublished || materialWhilePublished) {
    // Re-check version when publishing or materially changing a published episode.
    const merged = {
      id: existing.id,
      title: options.title !== undefined ? options.title.trim() : existing.title,
      description:
        options.description !== undefined
          ? options.description?.trim() || null
          : existing.description,
      audioUrl:
        options.audioUrl !== undefined ? options.audioUrl?.trim() || null : existing.audioUrl,
      listeningUrl: listeningUrl !== undefined ? listeningUrl : existing.listeningUrl,
      spotifyEpisodeUrl:
        spotifyEpisodeUrl !== undefined ? spotifyEpisodeUrl : existing.spotifyEpisodeUrl,
      publicationDate:
        options.publicationDate !== undefined
          ? options.publicationDate
          : existing.publicationDate,
    };

    const {
      computeEpisodePublicationVersionId,
      requirePublicationApproval,
    } = await import("@/lib/legal/service");
    const publicationVersionId = computeEpisodePublicationVersionId(merged);

    const appearances = await prisma.episodeAppearance.findMany({
      where: { episodeId: existing.id },
      select: { memberUserId: true, status: true },
    });
    const confirmed = appearances.filter((row) => row.status === "CONFIRMED");
    const pendingGuest = appearances.filter(
      (row) => row.status === "PENDING_ADMIN" || row.status === "PENDING_MEMBER",
    );

    // Guest participation in flight: do not publish without going through confirm + PUBLICATION_APPROVAL.
    if (pendingGuest.length > 0) {
      fail("LEGAL_PUBLICATION_REQUIRED");
    }

    if (confirmed.length > 0) {
      for (const row of confirmed) {
        try {
          await requirePublicationApproval({
            userId: row.memberUserId,
            episodeId: existing.id,
            publicationVersionId,
          });
        } catch {
          fail("LEGAL_PUBLICATION_REQUIRED");
        }
      }
    }
    // No appearances: guest-less catalog/editorial (includes RSS mirrors). Staff may publish.
  }

  return prisma.podcastEpisode.update({
    where: { id: options.episodeId },
    data: {
      ...(options.series !== undefined ? { series: options.series.trim() } : {}),
      ...(options.title !== undefined ? { title: options.title.trim() } : {}),
      ...(options.description !== undefined
        ? { description: options.description?.trim() || null }
        : {}),
      ...(options.publicationDate !== undefined
        ? { publicationDate: options.publicationDate }
        : {}),
      ...(listeningUrl !== undefined ? { listeningUrl } : {}),
      ...(spotifyEpisodeUrl !== undefined ? { spotifyEpisodeUrl } : {}),
      ...(options.artworkUrl !== undefined
        ? { artworkUrl: options.artworkUrl?.trim() || null }
        : {}),
      ...(options.audioUrl !== undefined ? { audioUrl: options.audioUrl?.trim() || null } : {}),
      ...(options.publicationState !== undefined
        ? { publicationState: options.publicationState }
        : {}),
      manualOverrides: mergeManualOverrides(existing.manualOverrides, changed),
    },
  });
}

export async function listAdminEpisodes(adminId: string) {
  await requireAdmin(adminId);
  return prisma.podcastEpisode.findMany({
    orderBy: [{ publicationDate: "desc" }, { createdAt: "desc" }],
  });
}

const publicEpisodeSelect = {
  id: true,
  slug: true,
  series: true,
  title: true,
  description: true,
  publicationDate: true,
  listeningUrl: true,
  spotifyEpisodeUrl: true,
  artworkUrl: true,
  audioUrl: true,
  durationSeconds: true,
  episodeNumber: true,
  seasonNumber: true,
} as const;

/** Public catalog — only published episodes. Newest first, optional title search + pagination. */
export async function listPublishedEpisodes(options?: {
  page?: number;
  pageSize?: number;
  q?: string;
}) {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options?.pageSize ?? 20));
  const q = options?.q?.trim();
  const where = {
    publicationState: "PUBLISHED" as const,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { series: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.podcastEpisode.count({ where }),
    prisma.podcastEpisode.findMany({
      where,
      orderBy: [{ publicationDate: "desc" }, { title: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: publicEpisodeSelect,
    }),
  ]);
  return { page, pageSize, total, items };
}

export async function listLatestPublishedEpisodes(limit = 6) {
  return prisma.podcastEpisode.findMany({
    where: { publicationState: "PUBLISHED" },
    orderBy: [{ publicationDate: "desc" }, { title: "asc" }],
    take: limit,
    select: publicEpisodeSelect,
  });
}

export async function getPublishedEpisodeBySlug(slug: string) {
  const episode = await prisma.podcastEpisode.findFirst({
    where: { slug, publicationState: "PUBLISHED" },
    select: {
      ...publicEpisodeSelect,
      descriptionHtml: true,
    },
  });
  if (!episode) return null;

  const appearances = await prisma.episodeAppearance.findMany({
    where: {
      episodeId: episode.id,
      status: "CONFIRMED",
      member: {
        profile: {
          published: true,
          publicationStatus: "APPROVED",
          showAppearancesOnProfile: true,
        },
      },
    },
    include: {
      member: {
        select: {
          id: true,
          profile: { select: { displayName: true, slug: true } },
        },
      },
    },
  });

  const guests = appearances
    .map((a) =>
      a.member.profile
        ? {
            creditLabel: a.creditLabel,
            displayName: a.member.profile.displayName,
            slug: a.member.profile.slug,
          }
        : null,
    )
    .filter(Boolean);

  return { episode, guests };
}

export async function listPublishedEpisodeOptions() {
  return prisma.podcastEpisode.findMany({
    where: { publicationState: "PUBLISHED" },
    orderBy: [{ series: "asc" }, { title: "asc" }],
    select: { id: true, series: true, title: true },
  });
}

/**
 * Member requests association. Cannot self-verify — admin must confirm.
 */
export async function requestAppearance(options: {
  memberUserId: string;
  episodeId: string;
  creditLabel?: string | null;
}) {
  const episode = await prisma.podcastEpisode.findUnique({ where: { id: options.episodeId } });
  if (!episode || episode.publicationState !== "PUBLISHED") fail("EPISODE_NOT_AVAILABLE");

  return prisma.episodeAppearance.upsert({
    where: {
      episodeId_memberUserId: {
        episodeId: options.episodeId,
        memberUserId: options.memberUserId,
      },
    },
    create: {
      episodeId: options.episodeId,
      memberUserId: options.memberUserId,
      status: "PENDING_ADMIN",
      requestedBy: "MEMBER",
      creditLabel: options.creditLabel?.trim() || null,
    },
    update: {
      status: "PENDING_ADMIN",
      requestedBy: "MEMBER",
      creditLabel: options.creditLabel?.trim() || null,
      rejectedAt: null,
      revokedAt: null,
      adminVerifiedAt: null,
      memberAcceptedAt: null,
    },
  });
}

/** Admin proposes appearance — requires member acceptance. */
export async function proposeAppearance(options: {
  adminId: string;
  memberUserId: string;
  episodeId: string;
  creditLabel?: string | null;
}) {
  await requireAdmin(options.adminId);
  const episode = await prisma.podcastEpisode.findUnique({ where: { id: options.episodeId } });
  if (!episode || episode.publicationState === "REMOVED") fail("EPISODE_NOT_AVAILABLE");

  return prisma.episodeAppearance.upsert({
    where: {
      episodeId_memberUserId: {
        episodeId: options.episodeId,
        memberUserId: options.memberUserId,
      },
    },
    create: {
      episodeId: options.episodeId,
      memberUserId: options.memberUserId,
      status: "PENDING_MEMBER",
      requestedBy: "ADMIN",
      proposedById: options.adminId,
      creditLabel: options.creditLabel?.trim() || null,
    },
    update: {
      status: "PENDING_MEMBER",
      requestedBy: "ADMIN",
      proposedById: options.adminId,
      creditLabel: options.creditLabel?.trim() || null,
      rejectedAt: null,
      revokedAt: null,
      adminVerifiedAt: null,
      memberAcceptedAt: null,
    },
  });
}

/** Admin verifies a member-requested appearance. */
export async function adminVerifyAppearance(options: {
  adminId: string;
  appearanceId: string;
}) {
  await requireAdmin(options.adminId);
  const row = await prisma.episodeAppearance.findUnique({ where: { id: options.appearanceId } });
  if (!row) fail("NOT_FOUND");
  if (row.status !== "PENDING_ADMIN") fail("INVALID_STATE");
  // Member cannot set adminVerifiedAt by editing request payload — only this path.
  return prisma.episodeAppearance.update({
    where: { id: row.id },
    data: {
      status: "CONFIRMED",
      adminVerifiedAt: new Date(),
      memberAcceptedAt: row.memberAcceptedAt ?? new Date(),
    },
  });
}

export async function memberAcceptAppearance(options: {
  memberUserId: string;
  appearanceId: string;
}) {
  const row = await prisma.episodeAppearance.findUnique({ where: { id: options.appearanceId } });
  if (!row || row.memberUserId !== options.memberUserId) fail("NOT_FOUND");
  if (row.status !== "PENDING_MEMBER") fail("INVALID_STATE");

  // Recording consent is required before confirming participation; it does not approve publication.
  const { requireRecordingConsent } = await import("@/lib/legal/service");
  try {
    await requireRecordingConsent({
      userId: options.memberUserId,
      relatedResourceType: "episode_appearance",
      relatedResourceId: row.id,
    });
  } catch {
    fail("LEGAL_RECORDING_REQUIRED");
  }

  const updated = await prisma.episodeAppearance.update({
    where: { id: row.id },
    data: {
      status: "CONFIRMED",
      memberAcceptedAt: new Date(),
      adminVerifiedAt: row.adminVerifiedAt ?? new Date(),
    },
  });

  if (row.proposedById) {
    const { createNotification } = await import("@/lib/notifications/service");
    await createNotification({
      userId: row.proposedById,
      kind: "appearance_accepted",
      title: "Bölüm görünümü kabul edildi",
      body: "Önerdiğin bölüm görünümü üye tarafından kabul edildi.",
      href: "/yonetim",
      payload: { appearanceId: row.id, episodeId: row.episodeId },
      dedupeKey: `appearance_accepted:${row.id}`,
    });
  }

  return updated;
}

export async function rejectAppearance(options: {
  actorId: string;
  appearanceId: string;
}) {
  const row = await prisma.episodeAppearance.findUnique({ where: { id: options.appearanceId } });
  if (!row) fail("NOT_FOUND");
  const actor = await prisma.user.findUnique({
    where: { id: options.actorId },
    select: { staffRole: true },
  });
  const isAdmin = actor?.staffRole === "ADMIN";
  const isMember = row.memberUserId === options.actorId;
  if (!isAdmin && !isMember) fail("FORBIDDEN");
  const updated = await prisma.episodeAppearance.update({
    where: { id: row.id },
    data: { status: "REJECTED", rejectedAt: new Date() },
  });

  const { createNotification } = await import("@/lib/notifications/service");
  if (isMember && row.proposedById) {
    await createNotification({
      userId: row.proposedById,
      kind: "appearance_rejected",
      title: "Bölüm görünümü reddedildi",
      body: "Önerdiğin bölüm görünümü üye tarafından reddedildi.",
      href: "/yonetim",
      payload: { appearanceId: row.id, episodeId: row.episodeId },
      dedupeKey: `appearance_rejected:${row.id}`,
    });
  } else if (isAdmin && !isMember) {
    await createNotification({
      userId: row.memberUserId,
      kind: "appearance_rejected",
      title: "Bölüm görünümü reddedildi",
      body: "Bölüm görünümü talebin yönetici tarafından reddedildi.",
      href: "/bolumler",
      payload: { appearanceId: row.id, episodeId: row.episodeId },
      dedupeKey: `appearance_rejected:${row.id}`,
    });
  }

  return updated;
}

/**
 * Confirmed appearances for public profile — only published episodes,
 * and only when member opted to show them. Respects profile publication.
 */
export async function listPublicAppearancesForMember(memberUserId: string) {
  const profile = await prisma.profile.findUnique({
    where: { userId: memberUserId },
    select: {
      showAppearancesOnProfile: true,
      published: true,
      publicationStatus: true,
    },
  });
  if (!profile?.showAppearancesOnProfile) return [];
  if (!profile.published || profile.publicationStatus !== "APPROVED") return [];

  const rows = await prisma.episodeAppearance.findMany({
    where: {
      memberUserId,
      status: "CONFIRMED",
      episode: { publicationState: "PUBLISHED" },
    },
    include: {
      episode: {
        select: {
          id: true,
          slug: true,
          series: true,
          title: true,
          listeningUrl: true,
          publicationDate: true,
        },
      },
    },
    orderBy: { episode: { publicationDate: "desc" } },
  });
  return rows.map((r) => ({
    id: r.id,
    creditLabel: r.creditLabel,
    episode: r.episode,
  }));
}

export async function listMemberAppearanceRequests(memberUserId: string) {
  return prisma.episodeAppearance.findMany({
    where: { memberUserId },
    include: {
      episode: {
        select: {
          id: true,
          series: true,
          title: true,
          publicationState: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listPendingAppearancesForAdmin(adminId: string) {
  await requireAdmin(adminId);
  return prisma.episodeAppearance.findMany({
    where: { status: "PENDING_ADMIN" },
    include: {
      episode: { select: { id: true, series: true, title: true, publicationState: true } },
      member: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export { fail as episodeFail };
