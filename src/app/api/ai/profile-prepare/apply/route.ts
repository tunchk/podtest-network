import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { applyJobSuggestions } from "@/lib/ai/jobs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    jobId?: string;
    acceptedFields?: string[];
    edits?: Record<string, unknown>;
    expectedDraftRevision?: number;
    userId?: string;
  };

  if (body.userId && body.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!body.jobId || !Array.isArray(body.acceptedFields) || typeof body.expectedDraftRevision !== "number") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const result = await applyJobSuggestions({
      userId: session.user.id,
      jobId: body.jobId,
      acceptedFields: body.acceptedFields,
      edits: body.edits ?? {},
      expectedDraftRevision: body.expectedDraftRevision,
    });
    return NextResponse.json({
      ok: true,
      draftRevision: result.profile.draftRevision,
      publicSnapshotUnchanged: true,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT") {
      return NextResponse.json(
        {
          error: "conflict",
          message: "Profil taslağı işlemden sonra değişti. Yeni düzenlemeler korundu; önerileri yeniden gözden geçirin.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "failed" }, { status: 400 });
  }
}
