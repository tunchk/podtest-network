import { NextResponse } from "next/server";
import { getPublicJobBySlug, isJobPubliclyApplyable } from "@/lib/hiring/jobs";

type Params = Promise<{ slug: string }>;

export async function GET(_request: Request, { params }: { params: Params }) {
  const { slug } = await params;
  const job = await getPublicJobBySlug(slug);
  if (!job) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({
    job: {
      ...job,
      applyable: isJobPubliclyApplyable(job),
      contactUserId: undefined,
    },
    apply: {
      method: job.applicationMethod,
      externalUrl: job.applicationMethod === "EXTERNAL_URL" ? job.applicationUrl : null,
      messagingAvailable: job.applicationMethod === "MESSAGING",
    },
  });
}
