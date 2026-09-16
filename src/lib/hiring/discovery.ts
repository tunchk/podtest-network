import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getPublicViewFromProfile, isPubliclyVisible } from "@/lib/profiles/service";
import type { PublicProfileView } from "@/lib/profiles/types";
import { evaluateUserCapability } from "@/lib/capabilities/evaluate";
import { requireWorkspaceMember } from "@/lib/hiring/access";

export type HiringSearchFilters = {
  skill?: string;
  openToWork?: boolean;
  openToProjects?: boolean;
  location?: string;
  workPreferences?: string;
  text?: string;
};

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

/**
 * Deterministic ordering: approvedAt desc, then slug asc.
 * No scoring or protected-attribute filters.
 */
export async function searchHiringCandidates(options: {
  actorId: string;
  workspaceId: string;
  filters: HiringSearchFilters;
  page?: number;
  pageSize?: number;
}) {
  const cap = await evaluateUserCapability(options.actorId, "hiring.search.advanced");
  if (!cap.allowed) fail("CAPABILITY_DENIED");
  await requireWorkspaceMember({ userId: options.actorId, workspaceId: options.workspaceId });

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, options.pageSize ?? 20);

  const where: Prisma.ProfileWhereInput = {
    published: true,
    discoverable: true,
    publicationStatus: "APPROVED",
    NOT: { publicSnapshot: { equals: Prisma.DbNull } },
  };

  if (options.filters.skill?.trim()) {
    where.skills = { has: options.filters.skill.trim() };
  }
  if (options.filters.openToWork) where.openToWork = true;
  if (options.filters.openToProjects) where.openToProjects = true;
  if (options.filters.location?.trim()) {
    where.location = { contains: options.filters.location.trim(), mode: "insensitive" };
  }
  if (options.filters.workPreferences?.trim()) {
    where.workPreferences = {
      contains: options.filters.workPreferences.trim(),
      mode: "insensitive",
    };
  }

  const text = options.filters.text?.trim();
  if (text) {
    where.OR = [
      { headline: { contains: text, mode: "insensitive" } },
      { bio: { contains: text, mode: "insensitive" } },
      { workPreferences: { contains: text, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.profile.count({ where }),
    prisma.profile.findMany({
      where,
      orderBy: [{ approvedAt: "desc" }, { slug: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const items = rows
    .map((row) => {
      if (!isPubliclyVisible(row)) return null;
      const view = getPublicViewFromProfile(row);
      if (!view) return null;
      return { userId: row.userId, view };
    })
    .filter((x): x is { userId: string; view: PublicProfileView } => x != null);

  return { page, pageSize, total, items, unsupportedFilters: [] as string[] };
}

export async function resolveCandidateVisibility(subjectUserId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId: subjectUserId } });
  if (!profile || !isPubliclyVisible(profile)) {
    return { available: false as const, userId: subjectUserId };
  }
  const view = getPublicViewFromProfile(profile);
  if (!view) return { available: false as const, userId: subjectUserId };
  return { available: true as const, userId: subjectUserId, view };
}
