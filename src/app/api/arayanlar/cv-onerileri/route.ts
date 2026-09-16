import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  applyOwnedCvProposalsToApplication,
  buildFactsPreview,
  toGuestApplicationView,
} from "@/lib/arayanlar/service";
import { seedAnswersFromProfile } from "@/lib/arayanlar/conversation";
import { prisma } from "@/lib/db";
import type { DraftAnswers } from "@/lib/arayanlar/constants";

/**
 * Explicit opt-in: fill Arayanlar editable proposals from an owned private CV.
 * No credit reservation/charge — prepare credits still apply only on fact confirm.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    cvDocumentId?: string;
    userId?: string;
  };

  if (body.userId && body.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!body.cvDocumentId) {
    return NextResponse.json({ error: "cvDocumentId_required" }, { status: 400 });
  }

  try {
    const { application, proposal } = await applyOwnedCvProposalsToApplication(
      session.user.id,
      body.cvDocumentId,
    );
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const profile = await prisma.profile.findUnique({ where: { userId: session.user.id } });
    const seeded = seedAnswersFromProfile(profile);
    const factsPreview = buildFactsPreview({
      displayName: user?.name ?? "Üye",
      answers: application.draftAnswers as DraftAnswers,
      profileHints: seeded.hints,
    });

    return NextResponse.json({
      application: toGuestApplicationView(application),
      factsPreview,
      notes: proposal.notes,
      hints: proposal.hints,
      // Never return raw CV text.
      cv: {
        id: proposal.cvDocumentId,
        originalFilename: proposal.originalFilename,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "error";
    const status =
      code === "Forbidden"
        ? 403
        : code === "COST_NOT_CONFIRMED" || code === "INVALID_STATE"
          ? 400
          : code === "CV_NOT_READY" || code === "CV_TEXT_MISSING"
            ? 400
            : 400;
    return NextResponse.json(
      {
        error: code,
        message:
          code === "COST_NOT_CONFIRMED"
            ? "Önce tanışmaya başla; CV önerileri maliyet onayı sonrası kullanılabilir."
            : code === "INVALID_STATE"
              ? "Bu aşamada CV önerisi uygulanamaz."
              : code === "CV_NOT_READY" || code === "CV_TEXT_MISSING"
                ? "Seçilen CV metni hazır değil. Profildeki CV sekmesinden yeniden yükle."
                : "CV önerileri uygulanamadı.",
      },
      { status },
    );
  }
}
