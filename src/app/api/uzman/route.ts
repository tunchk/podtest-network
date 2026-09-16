import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createExpertFaqDraft,
  editExpertFaq,
  expertApproveFaqRevision,
  listOwnerFaqs,
  listPublishedFaqsForExpert,
  removeExpertFaq,
  updateExpertSettings,
} from "@/lib/community/expert-faq";
import {
  declineTargetedQuestion,
  listTargetedForExpert,
  sendTargetedExpertQuestion,
} from "@/lib/community/targeted";

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  const status =
    code === "FORBIDDEN" || code === "BLOCKED"
      ? 403
      : code === "NOT_FOUND"
        ? 404
        : code === "RATE_LIMITED"
          ? 429
          : 400;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(request: Request) {
  const session = await getSession();
  const url = new URL(request.url);
  const expertUserId = url.searchParams.get("expertUserId");
  const mine = url.searchParams.get("mine");

  if (mine === "1") {
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const [faqs, targeted] = await Promise.all([
      listOwnerFaqs(session.user.id),
      listTargetedForExpert(session.user.id),
    ]);
    return NextResponse.json({ faqs, targeted });
  }

  if (expertUserId) {
    const faqs = await listPublishedFaqsForExpert(expertUserId);
    return NextResponse.json({ faqs });
  }

  return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    faqId?: string;
    revision?: number;
    question?: string;
    answer?: string;
    expertUserId?: string;
    proposedByAdmin?: boolean;
    expertDiscussionAreas?: string[];
    acceptTargetedQuestions?: boolean;
    consultationUrl?: string | null;
    consultationPaid?: boolean;
    showAppearancesOnProfile?: boolean;
    targetedId?: string;
    targetedBody?: string;
    questionId?: string;
  };

  try {
    if (body.action === "settings") {
      const profile = await updateExpertSettings({
        userId: session.user.id,
        expertDiscussionAreas: body.expertDiscussionAreas,
        acceptTargetedQuestions: body.acceptTargetedQuestions,
        consultationUrl: body.consultationUrl,
        consultationPaid: body.consultationPaid,
        showAppearancesOnProfile: body.showAppearancesOnProfile,
      });
      return NextResponse.json({ profile });
    }
    if (body.action === "create_faq") {
      const faq = await createExpertFaqDraft({
        expertUserId: body.proposedByAdmin
          ? body.expertUserId ?? ""
          : session.user.id,
        question: body.question ?? "",
        answer: body.answer ?? "",
        proposedByAdminId: body.proposedByAdmin ? session.user.id : null,
      });
      return NextResponse.json({ faq });
    }
    if (body.action === "edit_faq" && body.faqId) {
      const faq = await editExpertFaq({
        actorId: session.user.id,
        faqId: body.faqId,
        question: body.question ?? "",
        answer: body.answer ?? "",
      });
      return NextResponse.json({ faq });
    }
    if (body.action === "approve_faq" && body.faqId && body.revision != null) {
      const faq = await expertApproveFaqRevision({
        expertUserId: session.user.id,
        faqId: body.faqId,
        revision: body.revision,
      });
      return NextResponse.json({ faq });
    }
    if (body.action === "remove_faq" && body.faqId) {
      const faq = await removeExpertFaq({
        actorId: session.user.id,
        faqId: body.faqId,
      });
      return NextResponse.json({ faq });
    }
    if (body.action === "targeted" && body.expertUserId) {
      const row = await sendTargetedExpertQuestion({
        askerId: session.user.id,
        expertUserId: body.expertUserId,
        body: body.targetedBody ?? "",
        questionId: body.questionId,
      });
      return NextResponse.json({ targeted: row });
    }
    if (body.action === "decline_targeted" && body.targetedId) {
      const row = await declineTargetedQuestion({
        expertUserId: session.user.id,
        targetedId: body.targetedId,
      });
      return NextResponse.json({ targeted: row });
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
