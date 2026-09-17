import { prisma } from "@/lib/db";
import { computeEpisodePublicationVersionId, hasCurrentAcceptance } from "@/lib/legal/service";

export async function getHostPublicationPanelInitial(
  applicationId: string,
  options?: { actorIsAdmin?: boolean },
) {
  const app = await prisma.arayanlarApplication.findUnique({
    where: { id: applicationId },
  });
  if (!app) return null;

  const episode = app.publicationEpisodeId
    ? await prisma.podcastEpisode.findUnique({ where: { id: app.publicationEpisodeId } })
    : null;

  let alreadyApproved = false;
  if (episode) {
    const currentVersionId = computeEpisodePublicationVersionId(episode);
    const versionMatchesReview =
      !app.publicationReviewVersionId ||
      currentVersionId === app.publicationReviewVersionId;
    alreadyApproved =
      versionMatchesReview &&
      (await hasCurrentAcceptance({
        userId: app.userId,
        type: "PUBLICATION",
        documentType: "PUBLICATION_APPROVAL",
        relatedResourceType: "podcast_episode",
        relatedResourceId: episode.id,
        publicationVersionId: currentVersionId,
      }));
  }

  const facts = app.submittedFacts as { displayName?: string } | null;
  const actorIsAdmin = Boolean(options?.actorIsAdmin);

  return {
    episodeId: episode?.id ?? null,
    title: episode?.title ?? (facts?.displayName ? `Kariyer Portresi — ${facts.displayName}` : ""),
    description: episode?.description ?? "",
    artworkUrl: episode?.artworkUrl ?? "",
    listeningUrl: episode?.listeningUrl ?? "",
    reviewRequested: Boolean(app.publicationReviewRequestedAt),
    reviewVersionId: app.publicationReviewVersionId,
    changeNote: app.publicationChangeRequestNote,
    publicationState: episode?.publicationState ?? null,
    alreadyApproved,
    canPublish: actorIsAdmin && alreadyApproved && episode?.publicationState !== "PUBLISHED",
    publishBlockedReason:
      episode?.publicationState === "PUBLISHED"
        ? null
        : !alreadyApproved
          ? "Bu yayın versiyonu henüz aday tarafından onaylanmadı."
          : !actorIsAdmin
            ? "Yayına alma için yönetim yetkisi gerekir."
            : null,
  };
}
