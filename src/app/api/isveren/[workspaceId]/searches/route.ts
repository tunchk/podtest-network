import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listHiringSavedSearches, renameHiringSearch, saveHiringSearch } from "@/lib/hiring/candidates";
import type { HiringSearchFilters } from "@/lib/hiring/discovery";

type Params = Promise<{ workspaceId: string }>;

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  return NextResponse.json(
    { error: code },
    { status: code === "CAPABILITY_DENIED" ? 402 : code === "FORBIDDEN" ? 403 : 400 },
  );
}

export async function GET(_request: Request, { params }: { params: Params }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await params;
  try {
    const searches = await listHiringSavedSearches(session.user.id, workspaceId);
    return NextResponse.json({ searches });
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
    filters?: HiringSearchFilters;
    searchId?: string;
  };

  try {
    if (body.action === "save" || !body.action) {
      const search = await saveHiringSearch({
        userId: session.user.id,
        workspaceId,
        name: body.name ?? "",
        filters: body.filters ?? {},
      });
      return NextResponse.json({ search });
    }
    if (body.action === "rename" && body.searchId) {
      const search = await renameHiringSearch({
        userId: session.user.id,
        workspaceId,
        searchId: body.searchId,
        name: body.name ?? "",
      });
      return NextResponse.json({ search });
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
