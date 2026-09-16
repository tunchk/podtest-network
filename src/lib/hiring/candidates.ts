import { prisma } from "@/lib/db";
import { evaluateUserCapability } from "@/lib/capabilities/evaluate";
import { requireWorkspaceMember } from "@/lib/hiring/access";
import { resolveCandidateVisibility } from "@/lib/hiring/discovery";
import {
  HIRING_CANDIDATE_LISTS_MAX,
  HIRING_CANDIDATE_LIST_ENTRIES_MAX,
  HIRING_NOTE_MAX_CHARS,
  HIRING_SAVED_SEARCHES_MAX,
} from "@/lib/hiring/constants";
import type { HiringSearchFilters } from "@/lib/hiring/discovery";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

export async function saveHiringSearch(options: {
  userId: string;
  workspaceId: string;
  name: string;
  filters: HiringSearchFilters;
}) {
  const cap = await evaluateUserCapability(options.userId, "hiring.search.save");
  if (!cap.allowed) fail("CAPABILITY_DENIED");
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });

  const count = await prisma.hiringSavedSearch.count({ where: { workspaceId: options.workspaceId } });
  if (count >= HIRING_SAVED_SEARCHES_MAX) fail("LIMIT_EXCEEDED");

  const name = options.name.trim();
  if (!name) fail("INVALID_NAME");

  return prisma.hiringSavedSearch.create({
    data: {
      workspaceId: options.workspaceId,
      name,
      filters: options.filters,
      createdById: options.userId,
    },
  });
}

export async function renameHiringSearch(options: {
  userId: string;
  workspaceId: string;
  searchId: string;
  name: string;
}) {
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });
  const row = await prisma.hiringSavedSearch.findUnique({ where: { id: options.searchId } });
  if (!row || row.workspaceId !== options.workspaceId) fail("NOT_FOUND");
  return prisma.hiringSavedSearch.update({
    where: { id: row.id },
    data: { name: options.name.trim() },
  });
}

export async function listHiringSavedSearches(userId: string, workspaceId: string) {
  await requireWorkspaceMember({ userId, workspaceId });
  return prisma.hiringSavedSearch.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createCandidateList(options: {
  userId: string;
  workspaceId: string;
  name: string;
}) {
  const cap = await evaluateUserCapability(options.userId, "hiring.candidate_list.manage");
  if (!cap.allowed) fail("CAPABILITY_DENIED");
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });

  const count = await prisma.hiringCandidateList.count({ where: { workspaceId: options.workspaceId } });
  if (count >= HIRING_CANDIDATE_LISTS_MAX) fail("LIMIT_EXCEEDED");

  const name = options.name.trim();
  if (!name) fail("INVALID_NAME");

  return prisma.hiringCandidateList.create({
    data: { workspaceId: options.workspaceId, name, createdById: options.userId },
  });
}

export async function addCandidateToList(options: {
  userId: string;
  workspaceId: string;
  listId: string;
  subjectUserId: string;
}) {
  const cap = await evaluateUserCapability(options.userId, "hiring.candidate_list.manage");
  if (!cap.allowed) fail("CAPABILITY_DENIED");
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });

  const list = await prisma.hiringCandidateList.findUnique({ where: { id: options.listId } });
  if (!list || list.workspaceId !== options.workspaceId) fail("NOT_FOUND");

  const visible = await resolveCandidateVisibility(options.subjectUserId);
  if (!visible.available) fail("CANDIDATE_NOT_AVAILABLE");

  const entryCount = await prisma.hiringCandidateListEntry.count({ where: { listId: list.id } });
  if (entryCount >= HIRING_CANDIDATE_LIST_ENTRIES_MAX) fail("LIMIT_EXCEEDED");

  return prisma.hiringCandidateListEntry.upsert({
    where: {
      listId_subjectUserId: { listId: list.id, subjectUserId: options.subjectUserId },
    },
    create: {
      listId: list.id,
      subjectUserId: options.subjectUserId,
      addedById: options.userId,
    },
    update: {},
  });
}

export async function removeCandidateFromList(options: {
  userId: string;
  workspaceId: string;
  listId: string;
  subjectUserId: string;
}) {
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });
  const list = await prisma.hiringCandidateList.findUnique({ where: { id: options.listId } });
  if (!list || list.workspaceId !== options.workspaceId) fail("NOT_FOUND");
  await prisma.hiringCandidateListEntry.deleteMany({
    where: { listId: list.id, subjectUserId: options.subjectUserId },
  });
}

export async function listCandidateLists(userId: string, workspaceId: string) {
  await requireWorkspaceMember({ userId, workspaceId });
  return prisma.hiringCandidateList.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { entries: true } } },
  });
}

export async function listCandidateListEntries(options: {
  userId: string;
  workspaceId: string;
  listId: string;
}) {
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });
  const list = await prisma.hiringCandidateList.findUnique({ where: { id: options.listId } });
  if (!list || list.workspaceId !== options.workspaceId) fail("NOT_FOUND");

  const entries = await prisma.hiringCandidateListEntry.findMany({
    where: { listId: list.id },
    orderBy: { createdAt: "asc" },
  });

  const resolved = await Promise.all(
    entries.map(async (e) => {
      const vis = await resolveCandidateVisibility(e.subjectUserId);
      return {
        entryId: e.id,
        subjectUserId: e.subjectUserId,
        addedAt: e.createdAt,
        ...(vis.available
          ? { status: "available" as const, view: vis.view }
          : { status: "unavailable" as const }),
      };
    }),
  );
  return { list, entries: resolved };
}

export async function upsertCandidateNote(options: {
  userId: string;
  workspaceId: string;
  subjectUserId: string;
  body: string;
}) {
  const cap = await evaluateUserCapability(options.userId, "hiring.candidate_list.manage");
  if (!cap.allowed) fail("CAPABILITY_DENIED");
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });

  const body = options.body.trim();
  if (!body || body.length > HIRING_NOTE_MAX_CHARS) fail("INVALID_BODY");

  const existing = await prisma.hiringCandidateNote.findFirst({
    where: {
      workspaceId: options.workspaceId,
      subjectUserId: options.subjectUserId,
      authorId: options.userId,
    },
  });
  if (existing) {
    return prisma.hiringCandidateNote.update({
      where: { id: existing.id },
      data: { body },
    });
  }
  return prisma.hiringCandidateNote.create({
    data: {
      workspaceId: options.workspaceId,
      subjectUserId: options.subjectUserId,
      authorId: options.userId,
      body,
    },
  });
}

export async function listNotesForSubject(options: {
  userId: string;
  workspaceId: string;
  subjectUserId: string;
}) {
  await requireWorkspaceMember({ userId: options.userId, workspaceId: options.workspaceId });
  return prisma.hiringCandidateNote.findMany({
    where: { workspaceId: options.workspaceId, subjectUserId: options.subjectUserId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      body: true,
      authorId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
