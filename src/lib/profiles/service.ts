import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  draftFromProfile,
  toPublicProfileView,
  type ProfileDraftFields,
  type PublicProfileView,
} from "@/lib/profiles/types";
import type { Profile, PublicationStatus } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

export function hashProfileSnapshot(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export const CURRENT_MODERATION_POLICY_VERSION = "m1-manual-v1";

export async function ensureDefaultModerationPolicy() {
  await prisma.moderationPolicy.upsert({
    where: { version: CURRENT_MODERATION_POLICY_VERSION },
    update: {},
    create: {
      version: CURRENT_MODERATION_POLICY_VERSION,
      title: "Milestone 1 manual profile publication review",
      body: "Profile publication is manually reviewed. Automated moderation arrives before community posting and public rollout.",
      effectiveAt: new Date(),
    },
  });
}

export async function createDefaultProfileForUser(user: {
  id: string;
  name: string;
  email: string;
}) {
  const baseSlug =
    slugCandidateFromName(user.name) ||
    slugCandidateFromEmail(user.email) ||
    `uye-${user.id.slice(0, 8)}`;

  const slug = await ensureUniqueSlug(baseSlug);

  return prisma.profile.create({
    data: {
      userId: user.id,
      displayName: user.name.trim() || "PodTest üyesi",
      slug,
      publicationStatus: "DRAFT",
      published: false,
      discoverable: true,
    },
  });
}

function slugCandidateFromName(name: string) {
  return name
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function slugCandidateFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  return slugCandidateFromName(local);
}

export async function ensureUniqueSlug(base: string, excludeProfileId?: string) {
  let candidate = base || `uye-${Date.now()}`;
  let suffix = 0;

  while (true) {
    const existing = await prisma.profile.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeProfileId) {
      return candidate;
    }
    suffix += 1;
    candidate = `${base.slice(0, 40)}-${suffix}`;
  }
}

export async function getOwnedProfile(userId: string) {
  return prisma.profile.findUnique({ where: { userId } });
}

export async function updateOwnedProfileDraft(
  userId: string,
  patch: Partial<ProfileDraftFields>,
) {
  const profile = await getOwnedProfile(userId);
  if (!profile) {
    throw new Error("Profile not found");
  }

  const data: Prisma.ProfileUpdateInput = {};

  if (patch.displayName !== undefined) data.displayName = patch.displayName;
  if (patch.headline !== undefined) data.headline = patch.headline;
  if (patch.bio !== undefined) data.bio = patch.bio;
  if (patch.skills !== undefined) data.skills = patch.skills;
  if (patch.interests !== undefined) data.interests = patch.interests;
  if (patch.experience !== undefined) data.experience = patch.experience as Prisma.InputJsonValue;
  if (patch.education !== undefined) data.education = patch.education as Prisma.InputJsonValue;
  if (patch.projects !== undefined) data.projects = patch.projects as Prisma.InputJsonValue;
  if (patch.languages !== undefined) data.languages = patch.languages as Prisma.InputJsonValue;
  if (patch.location !== undefined) data.location = patch.location;
  if (patch.workPreferences !== undefined) data.workPreferences = patch.workPreferences;
  if (patch.publicLinks !== undefined) data.publicLinks = patch.publicLinks as Prisma.InputJsonValue;
  if (patch.openToWork !== undefined) data.openToWork = patch.openToWork;
  if (patch.hiring !== undefined) data.hiring = patch.hiring;
  if (patch.openToProjects !== undefined) data.openToProjects = patch.openToProjects;
  if (patch.discoverable !== undefined) data.discoverable = patch.discoverable;

  if (patch.slug !== undefined && patch.slug !== profile.slug) {
    data.slug = await ensureUniqueSlug(patch.slug, profile.id);
  }

  return prisma.profile.update({
    where: { id: profile.id },
    data: {
      ...data,
      draftRevision: { increment: 1 },
    },
  });
}

export async function submitProfileForReview(userId: string) {
  await ensureDefaultModerationPolicy();

  const profile = await getOwnedProfile(userId);
  if (!profile) {
    throw new Error("Profile not found");
  }

  const snapshot = draftFromProfile(profile);
  const snapshotHash = hashProfileSnapshot(snapshot);

  const review = await prisma.$transaction(async (tx) => {
    await tx.publicationReview.updateMany({
      where: { profileId: profile.id, status: "PENDING" },
      data: { status: "REJECTED", reason: "Superseded by a newer submission", resolvedAt: new Date() },
    });

    const created = await tx.publicationReview.create({
      data: {
        profileId: profile.id,
        status: "PENDING",
        submittedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        submittedDraftRevision: profile.draftRevision,
        snapshotHash,
        moderationPolicyVersion: CURRENT_MODERATION_POLICY_VERSION,
      },
    });

    await tx.profile.update({
      where: { id: profile.id },
      data: {
        publicationStatus: "PENDING_REVIEW",
        rejectionReason: null,
      },
    });

    return created;
  });

  // Assistive automated review — never auto-approves publication.
  const { runAutomatedPublicationReview } = await import("@/lib/moderation/automated-review");
  await runAutomatedPublicationReview(review.id).catch(() => {
    // Provider/config failures are recorded as UNAVAILABLE inside the adapter.
  });

  return review;
}

export async function unpublishProfile(userId: string) {
  const profile = await getOwnedProfile(userId);
  if (!profile) {
    throw new Error("Profile not found");
  }

  return prisma.profile.update({
    where: { id: profile.id },
    data: {
      published: false,
      publicationStatus: profile.publicSnapshot ? "UNPUBLISHED" : "DRAFT",
    },
  });
}

export async function markOnboardingSkipped(userId: string) {
  return prisma.profile.update({
    where: { userId },
    data: {
      onboardingSkippedAt: new Date(),
    },
  });
}

export async function markOnboardingCompleted(userId: string) {
  return prisma.profile.update({
    where: { userId },
    data: {
      onboardingCompletedAt: new Date(),
    },
  });
}

export function isPubliclyVisible(profile: Pick<Profile, "published" | "publicationStatus" | "publicSnapshot">) {
  return (
    profile.published &&
    profile.publicationStatus === "APPROVED" &&
    profile.publicSnapshot != null
  );
}

export function getPublicViewFromProfile(profile: Profile): PublicProfileView | null {
  if (!isPubliclyVisible(profile)) {
    return null;
  }
  return toPublicProfileView(profile.publicSnapshot as unknown as ProfileDraftFields);
}

export async function getPublicProfileBySlug(slug: string) {
  const profile = await prisma.profile.findUnique({ where: { slug } });
  if (!profile || !isPubliclyVisible(profile)) {
    return null;
  }
  return {
    profile,
    view: getPublicViewFromProfile(profile)!,
  };
}

export async function listDirectoryProfiles(options: {
  page: number;
  pageSize: number;
  skill?: string;
  openToWork?: boolean;
  hiring?: boolean;
  openToProjects?: boolean;
}) {
  const page = Math.max(1, options.page);
  const pageSize = Math.min(50, Math.max(1, options.pageSize));
  const where: Prisma.ProfileWhereInput = {
    published: true,
    discoverable: true,
    publicationStatus: "APPROVED",
    NOT: { publicSnapshot: { equals: Prisma.DbNull } },
  };

  if (options.skill) {
    where.skills = { has: options.skill };
  }
  if (options.openToWork) where.openToWork = true;
  if (options.hiring) where.hiring = true;
  if (options.openToProjects) where.openToProjects = true;

  const [total, rows] = await Promise.all([
    prisma.profile.count({ where }),
    prisma.profile.findMany({
      where,
      orderBy: { approvedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    items: rows
      .map((row) => getPublicViewFromProfile(row))
      .filter((item): item is PublicProfileView => item != null),
  };
}

export async function listPendingReviews() {
  return prisma.publicationReview.findMany({
    where: { status: "PENDING" },
    include: {
      profile: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function resolvePublicationReview(options: {
  reviewId: string;
  reviewerId: string;
  decision: "APPROVED" | "REJECTED";
  reason?: string;
}) {
  const review = await prisma.publicationReview.findUnique({
    where: { id: options.reviewId },
    include: { profile: true },
  });

  if (!review || review.status !== "PENDING") {
    throw new Error("Review not found or already resolved");
  }

  if (options.decision === "REJECTED" && !options.reason?.trim()) {
    throw new Error("Rejection reason is required");
  }

  // Approving applies this review's submitted snapshot only — never the live draft.
  // Snapshot integrity is the stored row itself; do not re-hash Prisma JSON (key order may differ).

  return prisma.$transaction(async (tx) => {
    const resolved = await tx.publicationReview.update({
      where: { id: review.id },
      data: {
        status: options.decision,
        reason: options.reason?.trim() || null,
        reviewerId: options.reviewerId,
        resolvedAt: new Date(),
      },
    });

    if (options.decision === "APPROVED") {
      const snap = review.submittedSnapshot as ProfileDraftFields;
      await tx.profile.update({
        where: { id: review.profileId },
        data: {
          // publicSnapshot comes only from the reviewed revision — not live draft.
          publicSnapshot: review.submittedSnapshot as Prisma.InputJsonValue,
          published: true,
          publicationStatus: "APPROVED" satisfies PublicationStatus,
          approvedAt: new Date(),
          rejectionReason: null,
          displayName: snap.displayName,
          slug: snap.slug,
          headline: snap.headline,
          bio: snap.bio,
          skills: snap.skills,
          interests: snap.interests,
          location: snap.location,
          workPreferences: snap.workPreferences,
          openToWork: snap.openToWork,
          hiring: snap.hiring,
          openToProjects: snap.openToProjects,
          discoverable: snap.discoverable,
        },
      });
    } else {
      await tx.profile.update({
        where: { id: review.profileId },
        data: {
          publicationStatus: review.profile.publicSnapshot ? "APPROVED" : "REJECTED",
          published: Boolean(review.profile.publicSnapshot) && review.profile.published,
          rejectionReason: options.reason?.trim() || null,
        },
      });
    }

    return resolved;
  });
}
