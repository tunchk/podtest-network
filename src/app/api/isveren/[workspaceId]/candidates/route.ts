import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { searchHiringCandidates, type HiringSearchFilters } from "@/lib/hiring/discovery";
import {
  addCandidateToList,
  createCandidateList,
  listCandidateListEntries,
  listCandidateLists,
  listNotesForSubject,
  removeCandidateFromList,
  upsertCandidateNote,
} from "@/lib/hiring/candidates";

type Params = Promise<{ workspaceId: string }>;

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  return NextResponse.json(
    { error: code },
    { status: code === "CAPABILITY_DENIED" ? 402 : code === "FORBIDDEN" ? 403 : 400 },
  );
}

export async function GET(request: Request, { params }: { params: Params }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { workspaceId } = await params;
  const url = new URL(request.url);
  const listId = url.searchParams.get("listId");
  const subjectUserId = url.searchParams.get("subjectUserId");

  try {
    if (listId) {
      const data = await listCandidateListEntries({
        userId: session.user.id,
        workspaceId,
        listId,
      });
      return NextResponse.json(data);
    }
    if (subjectUserId) {
      const notes = await listNotesForSubject({
        userId: session.user.id,
        workspaceId,
        subjectUserId,
      });
      return NextResponse.json({ notes });
    }
    const lists = await listCandidateLists(session.user.id, workspaceId);
    return NextResponse.json({ lists });
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
    filters?: HiringSearchFilters;
    page?: number;
    name?: string;
    listId?: string;
    subjectUserId?: string;
    note?: string;
  };

  try {
    if (body.action === "search") {
      const result = await searchHiringCandidates({
        actorId: session.user.id,
        workspaceId,
        filters: body.filters ?? {},
        page: body.page,
      });
      return NextResponse.json(result);
    }
    if (body.action === "create_list") {
      const list = await createCandidateList({
        userId: session.user.id,
        workspaceId,
        name: body.name ?? "",
      });
      return NextResponse.json({ list });
    }
    if (body.action === "add_to_list" && body.listId && body.subjectUserId) {
      const entry = await addCandidateToList({
        userId: session.user.id,
        workspaceId,
        listId: body.listId,
        subjectUserId: body.subjectUserId,
      });
      return NextResponse.json({ entry });
    }
    if (body.action === "remove_from_list" && body.listId && body.subjectUserId) {
      await removeCandidateFromList({
        userId: session.user.id,
        workspaceId,
        listId: body.listId,
        subjectUserId: body.subjectUserId,
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "note" && body.subjectUserId) {
      const note = await upsertCandidateNote({
        userId: session.user.id,
        workspaceId,
        subjectUserId: body.subjectUserId,
        body: body.note ?? "",
      });
      return NextResponse.json({ note });
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
