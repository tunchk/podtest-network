import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  cancelRecordingSchedule,
  scheduleRecording,
} from "@/lib/arayanlar/recording-schedule";

type Body = {
  action?: "schedule" | "cancel";
  date?: string;
  time?: string;
  timeZone?: string;
  meetingUrl?: string | null;
  note?: string | null;
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
    if (body.action === "cancel") {
      const result = await cancelRecordingSchedule({
        actorUserId: session.user.id,
        applicationId,
      });
      return NextResponse.json({
        ok: true,
        changed: result.changed,
        schedule: {
          ...result.schedule,
          scheduledAt: result.schedule.scheduledAt?.toISOString() ?? null,
          completedAt: result.schedule.completedAt?.toISOString() ?? null,
        },
      });
    }

    if (body.action === "schedule") {
      if (!body.date || !body.time) {
        return NextResponse.json(
          { error: "INVALID_DATETIME", message: "Tarih ve saat gerekli." },
          { status: 400 },
        );
      }
      const result = await scheduleRecording({
        actorUserId: session.user.id,
        applicationId,
        date: body.date,
        time: body.time,
        timeZone: body.timeZone,
        meetingUrl: body.meetingUrl,
        note: body.note,
      });
      return NextResponse.json({
        ok: true,
        changed: result.changed,
        schedule: {
          ...result.schedule,
          scheduledAt: result.schedule.scheduledAt?.toISOString() ?? null,
          completedAt: result.schedule.completedAt?.toISOString() ?? null,
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
      code === "FORBIDDEN" ? 403 : code === "NOT_READY" || code === "not_found" ? 409 : 400;
    return NextResponse.json({ error: code, message }, { status });
  }
}
