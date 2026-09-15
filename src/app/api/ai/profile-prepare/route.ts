import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  cancelOwnedJob,
  createProfilePrepareJob,
  getOwnedJob,
  quoteProfilePrepare,
  requestJobRetry,
  toPublicJobView,
} from "@/lib/ai/jobs";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const quote = searchParams.get("quote");

  if (quote === "1") {
    const q = await quoteProfilePrepare(session.user.id);
    return NextResponse.json(q);
  }

  if (id) {
    const job = await getOwnedJob(id, session.user.id);
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ job: toPublicJobView(job) });
  }

  const jobs = await prisma.aiJob.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    jobs: jobs.map(toPublicJobView),
    workerHint:
      "İş kuyruğu ayrı worker sürecinde işlenir. `npm run dev` hem web hem worker başlatır.",
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    cvDocumentId?: string;
    userId?: string;
    confirmCost?: boolean;
  };

  if (body.userId && body.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!body.confirmCost) {
    return NextResponse.json(
      { error: "Cost confirmation required", quote: await quoteProfilePrepare(session.user.id) },
      { status: 400 },
    );
  }

  if (!body.cvDocumentId) {
    return NextResponse.json({ error: "cvDocumentId required" }, { status: 400 });
  }

  try {
    const job = await createProfilePrepareJob({
      userId: session.user.id,
      cvDocumentId: body.cvDocumentId,
    });
    return NextResponse.json({ job: toPublicJobView(job) });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") {
      return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
    }
    return NextResponse.json({ error: "failed" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    jobId?: string;
    action?: "cancel" | "retry";
    userId?: string;
  };

  if (body.userId && body.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!body.jobId || !body.action) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    if (body.action === "cancel") {
      const job = await cancelOwnedJob(body.jobId, session.user.id);
      return NextResponse.json({ job: job ? toPublicJobView(job) : null });
    }
    const job = await requestJobRetry(body.jobId, session.user.id);
    return NextResponse.json({ job: toPublicJobView(job) });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 400 });
  }
}
