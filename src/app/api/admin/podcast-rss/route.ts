import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getOrInitFeedConfig,
  importRssFeed,
  previewRssFeed,
  saveFeedUrl,
  setEpisodeSpotifyUrl,
  type ImportResolution,
} from "@/lib/podcast/rss-import";

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  const status = code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 400;
  return NextResponse.json(
    { error: code, message: error instanceof Error ? error.message : undefined },
    { status },
  );
}

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const config = await getOrInitFeedConfig(session.user.id);
    return NextResponse.json({ config });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    feedUrl?: string;
    publishNew?: boolean;
    resolutions?: ImportResolution[];
    episodeId?: string;
    spotifyEpisodeUrl?: string | null;
  };

  try {
    if (body.action === "save_url" && body.feedUrl) {
      const config = await saveFeedUrl({
        adminId: session.user.id,
        feedUrl: body.feedUrl,
      });
      return NextResponse.json({ config });
    }
    if (body.action === "preview") {
      const preview = await previewRssFeed({
        adminId: session.user.id,
        feedUrl: body.feedUrl,
      });
      return NextResponse.json({ preview });
    }
    if (body.action === "import" || body.action === "refresh") {
      const result = await importRssFeed({
        adminId: session.user.id,
        feedUrl: body.feedUrl,
        publishNew: body.publishNew,
        resolutions: body.resolutions,
      });
      return NextResponse.json({ result });
    }
    if (body.action === "set_spotify" && body.episodeId) {
      const episode = await setEpisodeSpotifyUrl({
        adminId: session.user.id,
        episodeId: body.episodeId,
        spotifyEpisodeUrl: body.spotifyEpisodeUrl ?? null,
      });
      return NextResponse.json({ episode });
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
