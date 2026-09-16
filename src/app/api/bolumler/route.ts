import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  adminVerifyAppearance,
  createPodcastEpisode,
  listAdminEpisodes,
  listPendingAppearancesForAdmin,
  listPublishedEpisodes,
  memberAcceptAppearance,
  proposeAppearance,
  rejectAppearance,
  requestAppearance,
  updatePodcastEpisode,
} from "@/lib/community/episodes";
import type { PodcastEpisodePublicationState } from "@/generated/prisma/client";

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  const status = code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 400;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const admin = url.searchParams.get("admin");
  const session = await getSession();

  if (admin === "1") {
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    try {
      const [episodes, pending] = await Promise.all([
        listAdminEpisodes(session.user.id),
        listPendingAppearancesForAdmin(session.user.id),
      ]);
      return NextResponse.json({ episodes, pendingAppearances: pending });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const episodes = await listPublishedEpisodes();
  return NextResponse.json({ episodes });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    episodeId?: string;
    appearanceId?: string;
    memberUserId?: string;
    series?: string;
    title?: string;
    description?: string;
    publicationDate?: string;
    listeningUrl?: string;
    publicationState?: PodcastEpisodePublicationState;
    creditLabel?: string;
  };

  try {
    if (body.action === "create_episode") {
      const episode = await createPodcastEpisode({
        adminId: session.user.id,
        series: body.series ?? "",
        title: body.title ?? "",
        description: body.description,
        publicationDate: body.publicationDate ? new Date(body.publicationDate) : null,
        listeningUrl: body.listeningUrl,
        publicationState: body.publicationState,
      });
      return NextResponse.json({ episode });
    }
    if (body.action === "update_episode" && body.episodeId) {
      const episode = await updatePodcastEpisode({
        adminId: session.user.id,
        episodeId: body.episodeId,
        series: body.series,
        title: body.title,
        description: body.description,
        publicationDate: body.publicationDate ? new Date(body.publicationDate) : undefined,
        listeningUrl: body.listeningUrl,
        publicationState: body.publicationState,
      });
      return NextResponse.json({ episode });
    }
    if (body.action === "request_appearance" && body.episodeId) {
      const appearance = await requestAppearance({
        memberUserId: session.user.id,
        episodeId: body.episodeId,
        creditLabel: body.creditLabel,
      });
      return NextResponse.json({ appearance });
    }
    if (body.action === "propose_appearance" && body.episodeId && body.memberUserId) {
      const appearance = await proposeAppearance({
        adminId: session.user.id,
        memberUserId: body.memberUserId,
        episodeId: body.episodeId,
        creditLabel: body.creditLabel,
      });
      return NextResponse.json({ appearance });
    }
    if (body.action === "admin_verify" && body.appearanceId) {
      const appearance = await adminVerifyAppearance({
        adminId: session.user.id,
        appearanceId: body.appearanceId,
      });
      return NextResponse.json({ appearance });
    }
    if (body.action === "member_accept" && body.appearanceId) {
      const appearance = await memberAcceptAppearance({
        memberUserId: session.user.id,
        appearanceId: body.appearanceId,
      });
      return NextResponse.json({ appearance });
    }
    if (body.action === "reject" && body.appearanceId) {
      const appearance = await rejectAppearance({
        actorId: session.user.id,
        appearanceId: body.appearanceId,
      });
      return NextResponse.json({ appearance });
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
