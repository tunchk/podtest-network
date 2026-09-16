import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createAnswerDraft,
  removeAnswerByOwner,
  submitAnswer,
  updateAnswerDraft,
} from "@/lib/community/answers";

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

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    questionId?: string;
    answerId?: string;
    body?: string;
    idempotencyKey?: string;
  };

  try {
    if (body.action === "create" || !body.action) {
      const answer = await createAnswerDraft({
        authorId: session.user.id,
        questionId: body.questionId ?? "",
        body: body.body ?? "",
      });
      return NextResponse.json({ answer });
    }
    if (body.action === "update" && body.answerId) {
      const answer = await updateAnswerDraft({
        authorId: session.user.id,
        answerId: body.answerId,
        body: body.body ?? "",
      });
      return NextResponse.json({ answer });
    }
    if (body.action === "submit" && body.answerId) {
      const answer = await submitAnswer({
        authorId: session.user.id,
        answerId: body.answerId,
        idempotencyKey: body.idempotencyKey || `ans:${body.answerId}:${Date.now()}`,
      });
      return NextResponse.json({ answer });
    }
    if (body.action === "remove" && body.answerId) {
      const answer = await removeAnswerByOwner({
        authorId: session.user.id,
        answerId: body.answerId,
      });
      return NextResponse.json({ answer });
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
