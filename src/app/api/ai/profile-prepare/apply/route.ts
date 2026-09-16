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
      publicSnapshotUnchanged: result.publicSnapshotUnchanged,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT") {
      const currentDraftRevision =
        "currentDraftRevision" in error && typeof error.currentDraftRevision === "number"
          ? error.currentDraftRevision
          : undefined;
      return NextResponse.json(
        {
          error: "conflict",
          currentDraftRevision,
          message:
            "Profil taslağı işlemden sonra değişti. Yeni düzenlemeler korundu; önerileri yeniden gözden geçirip tekrar uygulamayı deneyin.",
        },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "NO_SELECTION") {
      return NextResponse.json(
        {
          error: "no_selection",
          message: "Uygulamak için en az bir öneri seçin. Boş seçim taslağı değiştirmez.",
        },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Job not ready") {
      return NextResponse.json(
        { error: "job_not_ready", message: "Öneriler henüz hazır değil veya iş bulunamadı." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "failed", message: "Seçilen öneriler uygulanamadı. Sayfayı yenileyip yeniden deneyin." },
      { status: 400 },
    );
  }
}
