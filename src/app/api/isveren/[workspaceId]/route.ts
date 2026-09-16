import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateEmployerWorkspace,
} from "@/lib/hiring/workspace";
import { requireWorkspaceMember } from "@/lib/hiring/access";
import { createEmployerMembershipInvitation } from "@/lib/hiring/invitations";

type Params = Promise<{ workspaceId: string }>;

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  return NextResponse.json({ error: code }, { status: code === "FORBIDDEN" ? 403 : 400 });
}

export async function GET(_request: Request, { params }: { params: Params }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await params;
  try {
    const access = await requireWorkspaceMember({ userId: session.user.id, workspaceId });
    const members = await listWorkspaceMembers(session.user.id, workspaceId);
    return NextResponse.json({ workspace: access.workspace, role: access.role, members });
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
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    name?: string;
    description?: string;
    website?: string;
    recipientEmail?: string;
    targetUserId?: string;
  };

  try {
    if (body.action === "update") {
      const workspace = await updateEmployerWorkspace({
        userId: session.user.id,
        workspaceId,
        name: body.name,
        description: body.description,
        website: body.website,
      });
      return NextResponse.json({ workspace });
    }
    if (body.action === "invite") {
      const result = await createEmployerMembershipInvitation({
        actorId: session.user.id,
        workspaceId,
        recipientEmail: body.recipientEmail,
      });
      return NextResponse.json(result);
    }
    if (body.action === "remove_member" && body.targetUserId) {
      await removeWorkspaceMember({
        actorId: session.user.id,
        workspaceId,
        targetUserId: body.targetUserId,
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
