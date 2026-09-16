import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { contactCandidateFromWorkspace } from "@/lib/hiring/outreach";

type Params = Promise<{ workspaceId: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    subjectUserId?: string;
    message?: string;
    idempotencyKey?: string;
    jobTitle?: string;
  };

  try {
    const result = await contactCandidateFromWorkspace({
      recruiterId: session.user.id,
      workspaceId,
      subjectUserId: body.subjectUserId ?? "",
      message: body.message ?? "",
      idempotencyKey: body.idempotencyKey ?? `outreach:${Date.now()}`,
      jobTitle: body.jobTitle,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
