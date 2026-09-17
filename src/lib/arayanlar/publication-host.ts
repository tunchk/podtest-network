import { prisma } from "@/lib/db";
import { computeEpisodePublicationVersionId, hasCurrentAcceptance } from "@/lib/legal/service";

/** Load host-facing publication panel initial state for an application. */
export async function getHostPublicationPanelInitial(applicationId: string) {
  const app = await prisma.arayanlarApplication.findUnique({
    where: { id: applicationId },
  });
  if (!app) return null;

  const episode = app.publicationEpisodeId
    ? await prisma.podcastEpisode.findUnique({ where: { id: app.publicationEpisodeId } })
    : null;

  let alreadyApproved = false;
  if (episode && app.publicationReviewVersionId) {
    alreadyApproved = await hasCurrentAcceptance({
      userId: app.userId,
      type: "PUBLICATION",
      documentType: "PUBLICATION_APPROVAL",
      relatedResourceType: "podcast_episode",
      relatedResourceId: episode.id,
      publicationVersionId: app.publicationReviewVersionId,
    });
  } else if (episode) {
    const versionId = computeEpisodePublicationVersionId(episode);
    alreadyApproved = await hasCurrentAcceptance({
      userId: app.userId,
      type: "PUBLICATION",
      documentType: "PUBLICATION_APPROVAL",
      relatedResourceType: "podcast_episode",
      relatedResourceId: episode.id,
      publicationVersionId: versionId,
    });
  }

  const facts = app.submittedFacts as { displayName?: string } | null;

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
  };
}
