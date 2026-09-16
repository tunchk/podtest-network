import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  closeJob,
  createJobDraft,
  listWorkspaceJobs,
  removeJob,
  submitJobForPublication,
  updateJobDraft,
} from "@/lib/hiring/jobs";
import type {
  JobApplicationMethod,
  JobEmploymentType,
  JobRemoteType,
  JobSalaryPeriod,
} from "@/generated/prisma/client";

type Params = Promise<{ workspaceId: string }>;

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  const status =
    code === "CAPABILITY_DENIED"
      ? 402
      : code === "ACTIVE_JOB_LIMIT"
        ? 429
        : code === "FORBIDDEN"
          ? 403
          : 400;
  return NextResponse.json({ error: code }, { status });
}

function parseInput(body: Record<string, unknown>) {
  return {
    title: String(body.title ?? ""),
    description: String(body.description ?? ""),
    responsibilities: body.responsibilities != null ? String(body.responsibilities) : null,
    skills: Array.isArray(body.skills) ? body.skills.map(String) : [],
    location: body.location != null ? String(body.location) : null,
    remoteType: (body.remoteType as JobRemoteType) ?? "UNSPECIFIED",
    employmentType: (body.employmentType as JobEmploymentType) ?? "FULL_TIME",
    salaryMin: body.salaryMin != null ? Number(body.salaryMin) : null,
    salaryMax: body.salaryMax != null ? Number(body.salaryMax) : null,
    salaryCurrency: body.salaryCurrency != null ? String(body.salaryCurrency) : null,
    salaryPeriod: (body.salaryPeriod as JobSalaryPeriod | null) ?? null,
    applicationMethod: body.applicationMethod as JobApplicationMethod,
    applicationUrl: body.applicationUrl != null ? String(body.applicationUrl) : null,
    contactUserId: body.contactUserId != null ? String(body.contactUserId) : null,
    closingDate: body.closingDate ? new Date(String(body.closingDate)) : null,
  };
}

export async function GET(_request: Request, { params }: { params: Params }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await params;
  try {
    const jobs = await listWorkspaceJobs(session.user.id, workspaceId);
    return NextResponse.json({ jobs });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Params }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & {
    action?: string;
    jobId?: string;
  };

  try {
    const input = parseInput(body);
    if (body.action === "create" || !body.action) {
      const job = await createJobDraft({
        userId: session.user.id,
        workspaceId,
        input,
      });
      return NextResponse.json({ job });
    }
    if (body.action === "update" && body.jobId) {
      const job = await updateJobDraft({
        userId: session.user.id,
        workspaceId,
        jobId: String(body.jobId),
        input,
      });
      return NextResponse.json({ job });
    }
    if (body.action === "submit" && body.jobId) {
      const job = await submitJobForPublication({
        userId: session.user.id,
        workspaceId,
        jobId: String(body.jobId),
      });
      return NextResponse.json({ job });
    }
    if (body.action === "close" && body.jobId) {
      const job = await closeJob({
        userId: session.user.id,
        workspaceId,
        jobId: String(body.jobId),
      });
      return NextResponse.json({ job });
    }
    if (body.action === "remove" && body.jobId) {
      const job = await removeJob({
        userId: session.user.id,
        workspaceId,
        jobId: String(body.jobId),
      });
      return NextResponse.json({ job });
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
