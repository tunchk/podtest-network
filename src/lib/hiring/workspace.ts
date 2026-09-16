import { prisma } from "@/lib/db";
import { evaluateUserCapability } from "@/lib/capabilities/evaluate";
import { sanitizeExternalUrl } from "@/lib/security/urls";
import { HIRING_WORKSPACES_PER_MEMBER } from "@/lib/hiring/constants";
import { ensureHiringPilotGrants } from "@/lib/hiring/pilot";
import { requireWorkspaceMember, requireWorkspaceOwner } from "@/lib/hiring/access";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

export async function createEmployerWorkspace(options: {
  userId: string;
  name: string;
  description?: string | null;
  website?: string | null;
}) {
  await ensureHiringPilotGrants(options.userId);
  const capability = await evaluateUserCapability(options.userId, "hiring.workspace.create");
  if (!capability.allowed) fail("CAPABILITY_DENIED");

  const name = options.name.trim();
  if (!name || name.length > 200) fail("INVALID_NAME");

  let website: string | null = null;
  if (options.website?.trim()) {
    website = sanitizeExternalUrl(options.website);
    if (!website) fail("INVALID_URL");
  }

  const owned = await prisma.employerWorkspace.count({
    where: { ownerId: options.userId, status: { not: "CLOSED" } },
  });
  if (owned >= HIRING_WORKSPACES_PER_MEMBER) fail("WORKSPACE_LIMIT");

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.employerWorkspace.create({
      data: {
        name,
        description: options.description?.trim() || null,
        website,
        ownerId: options.userId,
        status: "ACTIVE",
      },
    });
    await tx.employerWorkspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: options.userId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    return workspace;
  });
}

export async function updateEmployerWorkspace(options: {
  userId: string;
  workspaceId: string;
  name?: string;
  description?: string | null;
  website?: string | null;
}) {
  await requireWorkspaceOwner(options.userId, options.workspaceId);
  let website = options.website;
  if (website !== undefined && website !== null && website.trim()) {
    const safe = sanitizeExternalUrl(website);
    if (!safe) fail("INVALID_URL");
    website = safe;
  } else if (website !== undefined) {
    website = null;
  }
  return prisma.employerWorkspace.update({
    where: { id: options.workspaceId },
    data: {
      ...(options.name !== undefined ? { name: options.name.trim() } : {}),
      ...(options.description !== undefined
        ? { description: options.description?.trim() || null }
        : {}),
      ...(website !== undefined ? { website } : {}),
    },
  });
}

export async function removeWorkspaceMember(options: {
  actorId: string;
  workspaceId: string;
  targetUserId: string;
}) {
  const access = await requireWorkspaceOwner(options.actorId, options.workspaceId);
  if (options.targetUserId === access.userId) fail("CANNOT_REMOVE_OWNER");
  const target = await prisma.employerWorkspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: options.workspaceId,
        userId: options.targetUserId,
      },
    },
  });
  if (!target || target.status !== "ACTIVE") fail("NOT_FOUND");
  if (target.role === "OWNER") fail("CANNOT_REMOVE_OWNER");
  return prisma.employerWorkspaceMember.update({
    where: { id: target.id },
    data: { status: "REMOVED", removedAt: new Date() },
  });
}

export async function listWorkspaceMembers(actorId: string, workspaceId: string) {
  await requireWorkspaceMember({ userId: actorId, workspaceId });
  return prisma.employerWorkspaceMember.findMany({
    where: { workspaceId, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}
