import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canMutateRecordingSchedule } from "@/lib/arayanlar/recording-schedule";
import { sendKariyerPortresiHostHandoff } from "@/lib/arayanlar/host-handoff";

type Params = { params: Promise<{ id: string }> };

/**
 * Staff/host trigger for Kariyer Portresi host handoff.
 * Reuses candidate-side handoff semantics (idempotent DM); does not mutate prep.
 */
export async function POST(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: applicationId } = await params;
  const access = await canMutateRecordingSchedule({
    actorUserId: session.user.id,
    applicationId,
  });
  if (!access.ok) {
    const status = access.reason === "not_found" ? 404 : 403;
    return NextResponse.json({ error: access.reason }, { status });
  }

  const result = await sendKariyerPortresiHostHandoff({
    candidateUserId: access.application.userId,
  });

  if (!result.ok) {
    const status =
      result.code === "HOST_NOT_CONFIGURED" ||
      result.code === "HOST_NOT_FOUND" ||
      result.code === "HOST_NOT_AUTHORIZED"
        ? 503
        : result.code === "NOT_READY" || result.code === "MISSING_NOTES"
          ? 409
          : result.code === "RATE_LIMITED"
            ? 429
            : 400;
    return NextResponse.json(
      { error: result.code, message: result.message },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    alreadySent: result.alreadySent,
    conversationId: result.conversationId,
    hostNotesPath: result.hostNotesPath,
    confirmation: result.alreadySent ? "Daha önce gönderilmişti" : "Host'a gönderildi",
  });
}
