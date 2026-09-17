import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  publishKariyerPortresiEpisode,
  sendKariyerPublicationForApproval,
} from "@/lib/arayanlar/publication";
import { hasCurrentAcceptance } from "@/lib/legal/service";
import { prisma } from "@/lib/db";

type Body = {
  action?: "send_for_approval" | "publish";
  episodeId?: string | null;
  title?: string;
  description?: string | null;
  artworkUrl?: string | null;
  listeningUrl?: string | null;
};

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: applicationId } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;

  try {
    if (body.action === "send_for_approval") {
      const result = await sendKariyerPublicationForApproval({
        actorUserId: session.user.id,
        applicationId,
        episodeId: body.episodeId,
        title: body.title,
        description: body.description,
        artworkUrl: body.artworkUrl,
        listeningUrl: body.listeningUrl,
      });
      const app = await prisma.arayanlarApplication.findUniqueOrThrow({
        where: { id: applicationId },
      });
      const alreadyApproved = await hasCurrentAcceptance({
        userId: app.userId,
        type: "PUBLICATION",
        documentType: "PUBLICATION_APPROVAL",
        relatedResourceType: "podcast_episode",
        relatedResourceId: result.episode.id,
        publicationVersionId: result.publicationVersionId,
      });
      return NextResponse.json({
        ok: true,
        changed: result.changed,
        publicationVersionId: result.publicationVersionId,
        alreadyApproved,
        episode: {
          id: result.episode.id,
          title: result.episode.title,
          publicationState: result.episode.publicationState,
        },
      });
    }

    if (body.action === "publish") {
      const published = await publishKariyerPortresiEpisode({
        actorUserId: session.user.id,
        applicationId,
      });
      return NextResponse.json({
        ok: true,
        episode: {
          id: published.id,
          title: published.title,
          publicationState: published.publicationState,
          slug: published.slug,
        },
      });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: string }).code)
        : "error";
    const message = error instanceof Error ? error.message : "İşlem başarısız.";
    const status =
      code === "FORBIDDEN"
        ? 403
        : code === "PUBLICATION_APPROVAL_REQUIRED" || code === "NOT_READY"
          ? 409
          : 400;
    return NextResponse.json({ error: code, message }, { status });
  }
}
