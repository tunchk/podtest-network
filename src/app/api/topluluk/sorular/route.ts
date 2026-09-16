import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createQuestionDraft,
  getOwnerQuestion,
  getPublicQuestion,
  listPublishedQuestions,
  removeQuestionByOwner,
  submitQuestion,
  updateQuestionDraft,
} from "@/lib/community/questions";
import { getCommunityQuotaStatus } from "@/lib/community/quota";
import { listPublishedEpisodeOptions } from "@/lib/community/episodes";

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  const status =
    code === "QUOTA_EXCEEDED"
      ? 429
      : code === "FORBIDDEN" || code === "BLOCKED"
        ? 403
        : code === "NOT_FOUND"
          ? 404
          : 400;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const session = await getSession();
    const pub = await getPublicQuestion(id);
    if (pub) return NextResponse.json(pub);
    if (session?.user?.id) {
      const owner = await getOwnerQuestion({ authorId: session.user.id, questionId: id });
      if (owner) return NextResponse.json({ ...owner, ownerView: true });
    }
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const page = Number(url.searchParams.get("page") ?? "1");
  const list = await listPublishedQuestions({ page });
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    questionId?: string;
    title?: string;
    body?: string;
    topicTags?: string[];
    episodeId?: string | null;
    idempotencyKey?: string;
  };

  try {
    if (body.action === "create" || !body.action) {
      const q = await createQuestionDraft({
        authorId: session.user.id,
        title: body.title ?? "",
        body: body.body ?? "",
        topicTags: body.topicTags,
        episodeId: body.episodeId,
      });
      return NextResponse.json({ question: q });
    }
    if (body.action === "update" && body.questionId) {
      const q = await updateQuestionDraft({
        authorId: session.user.id,
        questionId: body.questionId,
        title: body.title ?? "",
        body: body.body ?? "",
        topicTags: body.topicTags,
        episodeId: body.episodeId,
      });
      return NextResponse.json({ question: q });
    }
    if (body.action === "submit" && body.questionId) {
      const q = await submitQuestion({
        authorId: session.user.id,
        questionId: body.questionId,
        idempotencyKey: body.idempotencyKey || `submit:${body.questionId}:${Date.now()}`,
      });
      return NextResponse.json({ question: q });
    }
    if (body.action === "remove" && body.questionId) {
      const q = await removeQuestionByOwner({
        authorId: session.user.id,
        questionId: body.questionId,
      });
      return NextResponse.json({ question: q });
    }
    if (body.action === "meta") {
      const [quotaQ, quotaA, episodes] = await Promise.all([
        getCommunityQuotaStatus(session.user.id, "QUESTION"),
        getCommunityQuotaStatus(session.user.id, "ANSWER"),
        listPublishedEpisodeOptions(),
      ]);
      return NextResponse.json({ quotaQuestion: quotaQ, quotaAnswer: quotaA, episodes });
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
