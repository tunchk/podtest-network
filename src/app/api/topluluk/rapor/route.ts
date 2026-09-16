import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createContentReport } from "@/lib/messaging/reports";
import type { ReportTargetType } from "@/generated/prisma/client";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    targetType?: ReportTargetType;
    targetId?: string;
    reasonCode?: string;
    explanation?: string;
  };

  const allowed: ReportTargetType[] = [
    "COMMUNITY_QUESTION",
    "COMMUNITY_ANSWER",
    "EXPERT_FAQ",
    "PROFILE",
    "MESSAGE",
    "MESSAGE_REQUEST",
  ];
  if (!body.targetType || !allowed.includes(body.targetType) || !body.targetId || !body.reasonCode) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const result = await createContentReport({
      reporterId: session.user.id,
      targetType: body.targetType,
      targetId: body.targetId,
      reasonCode: body.reasonCode,
      explanation: body.explanation,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: string }).code)
        : "error";
    return NextResponse.json({ error: code }, { status: code === "FORBIDDEN" ? 403 : 400 });
  }
}
