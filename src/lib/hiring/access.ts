import { prisma } from "@/lib/db";
import type { EmployerWorkspaceRole } from "@/generated/prisma/client";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

export type WorkspaceAccess = {
  workspaceId: string;
  userId: string;
  role: EmployerWorkspaceRole;
  memberId: string;
};

/** Never trust client workspaceId without this check. */
export async function requireWorkspaceMember(options: {
  userId: string;
  workspaceId: string;
  roles?: EmployerWorkspaceRole[];
}) {
  const member = await prisma.employerWorkspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: options.workspaceId,
        userId: options.userId,
      },
    },
    include: { workspace: true },
  });
  if (!member || member.status !== "ACTIVE") fail("FORBIDDEN");
  if (member.workspace.status !== "ACTIVE") fail("WORKSPACE_INACTIVE");
  if (options.roles && !options.roles.includes(member.role)) fail("FORBIDDEN");
  return {
    workspaceId: member.workspaceId,
    userId: member.userId,
    role: member.role,
    memberId: member.id,
    workspace: member.workspace,
  } satisfies WorkspaceAccess & { workspace: typeof member.workspace };
}

export async function requireWorkspaceOwner(userId: string, workspaceId: string) {
  return requireWorkspaceMember({ userId, workspaceId, roles: ["OWNER"] });
}

export async function listActiveWorkspacesForUser(userId: string) {
  const rows = await prisma.employerWorkspaceMember.findMany({
    where: { userId, status: "ACTIVE", workspace: { status: "ACTIVE" } },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    ...r.workspace,
    role: r.role,
    memberId: r.id,
  }));
}
