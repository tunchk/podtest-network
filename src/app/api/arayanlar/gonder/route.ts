import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  buildFactsPreview,
  getGuestBriefForMember,
  reconcileArayanlarPrepStatusFromJob,
  retryArayanlarPreparation,
  startRevisionDraft,
  submitApplication,
  toGuestApplicationView,
  withdrawApplication,
} from "@/lib/arayanlar/service";
import type { DraftAnswers, SubmittedFacts } from "@/lib/arayanlar/constants";
import { seedAnswersFromProfile } from "@/lib/arayanlar/conversation";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await reconcileArayanlarPrepStatusFromJob(session.user.id);

  const app = await prisma.arayanlarApplication.findUnique({
    where: { userId: session.user.id },
  });
  if (!app) {
    return NextResponse.json({
      application: null,
      guestBrief: null,
      factsPreview: null,
      prepJob: null,
    });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const profile = await prisma.profile.findUnique({ where: { userId: session.user.id } });
  const seeded = seedAnswersFromProfile(profile);
  const factsPreview = buildFactsPreview({
    displayName: user?.name ?? "Üye",
    answers: app.draftAnswers as DraftAnswers,
    profileHints: seeded.hints,
  });

  const guestBrief = await getGuestBriefForMember(session.user.id);

  let prepJob: {
    attemptCount: number;
    maxAttempts: number;
    status: string;
  } | null = null;
  if (app.prepareJobId) {
    const job = await prisma.aiJob.findUnique({
      where: { id: app.prepareJobId },
      select: { attemptCount: true, maxAttempts: true, status: true },
    });
    if (job) prepJob = job;
  }

  return NextResponse.json({
    application: toGuestApplicationView(app),
    factsPreview,
    guestBrief,
    prepJob,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    facts?: SubmittedFacts;
  };

  try {
    if (body.action === "withdraw") {
      const app = await withdrawApplication(session.user.id);
      return NextResponse.json({ application: toGuestApplicationView(app) });
    }
    if (body.action === "revise") {
      const app = await startRevisionDraft(session.user.id);
      return NextResponse.json({ application: toGuestApplicationView(app) });
    }
    if (body.action === "retry_prep") {
      const app = await retryArayanlarPreparation(session.user.id);
      const job = app.prepareJobId
        ? await prisma.aiJob.findUnique({
            where: { id: app.prepareJobId },
            select: { attemptCount: true, maxAttempts: true, status: true },
          })
        : null;
      return NextResponse.json({
        application: toGuestApplicationView(app),
        prepJob: job,
      });
    }
    if (body.action === "submit") {
      if (!body.facts) {
        return NextResponse.json({ error: "facts_required" }, { status: 400 });
      }
      const result = await submitApplication({
        userId: session.user.id,
        facts: body.facts,
      });
      return NextResponse.json({
        application: toGuestApplicationView(result.application),
        jobId: result.jobId,
      });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "error";
    const status = code === "INSUFFICIENT_CREDITS" ? 402 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
