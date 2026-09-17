import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  approveKariyerPublication,
  requestKariyerPublicationChanges,
} from "@/lib/arayanlar/publication";

type Body = {
  action?: "approve" | "request_changes";
  note?: string;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;

  try {
    if (body.action === "approve") {
      const result = await approveKariyerPublication({
        candidateUserId: session.user.id,
      });
      return NextResponse.json({
        ok: true,
        created: result.created,
        publicationVersionId: result.publicationVersionId,
      });
    }

    if (body.action === "request_changes") {
      await requestKariyerPublicationChanges({
        candidateUserId: session.user.id,
        note: body.note ?? "",
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: string }).code)
        : "error";
    const message = error instanceof Error ? error.message : "İşlem başarısız.";
    const status = code === "FORBIDDEN" ? 403 : code === "NOT_READY" ? 409 : 400;
    return NextResponse.json({ error: code, message }, { status });
  }
}
