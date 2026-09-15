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

  try {
    if (!body.targetType || !body.targetId || !body.reasonCode) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const result = await createContentReport({
      reporterId: session.user.id,
      targetType: body.targetType,
      targetId: body.targetId,
      reasonCode: body.reasonCode,
      explanation: body.explanation,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
    const status = code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "RATE_LIMITED" ? 429 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
