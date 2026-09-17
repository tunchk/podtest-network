import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendKariyerPortresiHostHandoff } from "@/lib/arayanlar/host-handoff";

export async function POST() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendKariyerPortresiHostHandoff({
    candidateUserId: session.user.id,
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
    confirmation: "Host'a gönderildi",
  });
}
