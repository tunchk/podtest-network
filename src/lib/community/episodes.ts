import { prisma } from "@/lib/db";
import { sanitizeExternalUrl } from "@/lib/security/urls";
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

export async function createPodcastEpisode(options: {
  adminId: string;
  series: string;
  title: string;
  description?: string | null;
  publicationDate?: Date | null;
  listeningUrl?: string | null;
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
  return prisma.podcastEpisode.create({
    data: {
      series,
      title,
      description: options.description?.trim() || null,
      publicationDate: options.publicationDate ?? null,
      listeningUrl,
      publicationState: options.publicationState ?? "DRAFT",
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
      ...(options.publicationState !== undefined
        ? { publicationState: options.publicationState }
        : {}),
    },
  });
}

export async function listAdminEpisodes(adminId: string) {
  await requireAdmin(adminId);
  return prisma.podcastEpisode.findMany({
    orderBy: [{ publicationDate: "desc" }, { createdAt: "desc" }],
  });
}

/** Public catalog — only published episodes. */
export async function listPublishedEpisodes() {
  return prisma.podcastEpisode.findMany({
    where: { publicationState: "PUBLISHED" },
    orderBy: [{ publicationDate: "desc" }, { title: "asc" }],
    select: {
      id: true,
      series: true,
      title: true,
      description: true,
      publicationDate: true,
      listeningUrl: true,
    },
  });
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
  return prisma.episodeAppearance.update({
    where: { id: row.id },
    data: {
      status: "CONFIRMED",
      memberAcceptedAt: new Date(),
      adminVerifiedAt: row.adminVerifiedAt ?? new Date(),
    },
  });
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
  return prisma.episodeAppearance.update({
    where: { id: row.id },
    data: { status: "REJECTED", rejectedAt: new Date() },
  });
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
