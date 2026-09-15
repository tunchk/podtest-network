import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getOrCreateApplication,
  postConversationMessage,
  switchToSummaryFallback,
  toGuestApplicationView,
} from "@/lib/arayanlar/service";
import type { DraftAnswers } from "@/lib/arayanlar/constants";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    skip?: boolean;
    summaryFallback?: boolean;
    answers?: DraftAnswers;
  };

  try {
    if (body.summaryFallback) {
      const app = await switchToSummaryFallback(session.user.id, body.answers ?? {});
      return NextResponse.json({ application: toGuestApplicationView(app) });
    }

    const app = await postConversationMessage({
      userId: session.user.id,
      message: body.message ?? "",
      skip: body.skip,
    });
    return NextResponse.json({ application: toGuestApplicationView(app) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "error";
    // Preserve prior answers on failure — return current app state when possible
    const current = await getOrCreateApplication(session.user.id).catch(() => null);
    return NextResponse.json(
      {
        error: code,
        application: current ? toGuestApplicationView(current) : null,
      },
      { status: 400 },
    );
  }
}
