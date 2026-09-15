import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getHostPackForAssignedHost,
  requestHostPackRegeneration,
  saveHostPackEdits,
} from "@/lib/arayanlar/service";
import type { HostPack } from "@/lib/arayanlar/artifact-schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const result = await getHostPackForAssignedHost({
    hostUserId: session.user.id,
    applicationId: id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 403 });
  }
  return NextResponse.json(result);
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    edits?: HostPack;
  };

  try {
    if (body.action === "regen") {
      const job = await requestHostPackRegeneration({
        hostUserId: session.user.id,
        applicationId: id,
      });
      return NextResponse.json({ jobId: job.id });
    }
    if (body.action === "save_edits" && body.edits) {
      await saveHostPackEdits({
        hostUserId: session.user.id,
        applicationId: id,
        edits: body.edits,
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "error";
    const status = code === "RATE_LIMITED" ? 429 : 403;
    return NextResponse.json({ error: code }, { status });
  }
}
