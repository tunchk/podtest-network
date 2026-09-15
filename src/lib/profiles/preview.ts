import { prisma } from "@/lib/db";
import { draftFromProfile, toPublicProfileView } from "@/lib/profiles/types";

/**
 * Owner-only draft preview. Never trusts a forged user id from the client —
 * callers must pass the authenticated session user id.
 * ?onizleme=1 alone never grants access to another member's private profile.
 */
export async function getOwnerDraftPreviewBySlug(
  slug: string,
  viewerUserId: string | null | undefined,
) {
  if (!viewerUserId) {
    return null;
  }

  const profile = await prisma.profile.findUnique({ where: { slug } });
  if (!profile || profile.userId !== viewerUserId) {
    return null;
  }

  return {
    profile,
    view: toPublicProfileView(draftFromProfile(profile)),
  };
}
