import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  listOpenModerationCases,
  listHeldItems,
  dismissReport,
  removeReportedContent,
  temporarilyRestrictMessaging,
  releaseModerationHold,
} from "@/lib/messaging/reports";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const [cases, holds] = await Promise.all([
      listOpenModerationCases(session.user.id),
      listHeldItems(session.user.id),
    ]);
    return NextResponse.json({ cases, holds });
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    caseId?: string;
    holdId?: string;
    targetUserId?: string;
    hours?: number;
    note?: string;
  };

  try {
    if (body.action === "dismiss" && body.caseId) {
      await dismissReport({ actorId: session.user.id, caseId: body.caseId, note: body.note });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "remove_content" && body.caseId) {
      await removeReportedContent({
        actorId: session.user.id,
        caseId: body.caseId,
        note: body.note,
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "restrict" && body.caseId && body.targetUserId) {
      await temporarilyRestrictMessaging({
        actorId: session.user.id,
        caseId: body.caseId,
        targetUserId: body.targetUserId,
        hours: body.hours,
        note: body.note,
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "release_hold" && body.holdId) {
      const result = await releaseModerationHold({
        actorId: session.user.id,
        holdId: body.holdId,
      });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
    return NextResponse.json({ error: code }, { status: code === "FORBIDDEN" ? 403 : 400 });
  }
}
