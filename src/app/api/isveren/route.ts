import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createEmployerWorkspace } from "@/lib/hiring/workspace";
import { listActiveWorkspacesForUser } from "@/lib/hiring/access";
import { ensureHiringPilotGrants } from "@/lib/hiring/pilot";

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  const status =
    code === "CAPABILITY_DENIED"
      ? 402
      : code === "FORBIDDEN"
        ? 403
        : code === "WORKSPACE_LIMIT"
          ? 429
          : 400;
  return NextResponse.json({ error: code }, { status });
}

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const workspaces = await listActiveWorkspacesForUser(session.user.id);
  return NextResponse.json({ workspaces });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    website?: string;
  };
  try {
    await ensureHiringPilotGrants(session.user.id);
    const workspace = await createEmployerWorkspace({
      userId: session.user.id,
      name: body.name ?? "",
      description: body.description,
      website: body.website,
    });
    return NextResponse.json({ workspace });
  } catch (error) {
    return errorResponse(error);
  }
}
