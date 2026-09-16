import { prisma } from "@/lib/db";
import type { EmployerWorkspaceRole } from "@/generated/prisma/client";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  isEmailVerified,
} from "@/lib/auth/email-verification";
import { HIRING_INVITATION_TTL_HOURS } from "@/lib/hiring/constants";
import { requireWorkspaceOwner } from "@/lib/hiring/access";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

export async function createEmployerMembershipInvitation(options: {
  actorId: string;
  workspaceId: string;
  recipientEmail?: string | null;
  role?: EmployerWorkspaceRole;
  ttlHours?: number;
}) {
  const access = await requireWorkspaceOwner(options.actorId, options.workspaceId);
  if (options.role === "OWNER") fail("INVALID_ROLE");

  const plaintext = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(plaintext);
  const expiresAt = new Date(
    Date.now() + (options.ttlHours ?? HIRING_INVITATION_TTL_HOURS) * 60 * 60 * 1000,
  );

  const invitation = await prisma.employerMembershipInvitation.create({
    data: {
      workspaceId: access.workspaceId,
      createdById: options.actorId,
      recipientEmail: options.recipientEmail?.trim().toLowerCase() || null,
      role: options.role ?? "RECRUITER",
      tokenHash,
      expiresAt,
    },
  });

  return {
    invitation: {
      id: invitation.id,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      recipientEmail: invitation.recipientEmail,
    },
    acceptPath: `/davet/isveren?token=${plaintext}`,
    plaintextToken: plaintext,
  };
}

export async function acceptEmployerMembershipInvitation(options: {
  userId: string;
  token: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: options.userId },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!user) fail("NOT_FOUND");

  const tokenHash = hashOpaqueToken(options.token);

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        workspaceId: string;
        recipientEmail: string | null;
        role: EmployerWorkspaceRole;
        expiresAt: Date;
        revokedAt: Date | null;
        consumedAt: Date | null;
        consumedById: string | null;
        createdById: string;
      }>
    >`
      SELECT id, "workspaceId", "recipientEmail", role, "expiresAt", "revokedAt", "consumedAt", "consumedById", "createdById"
      FROM employer_membership_invitation
      WHERE "tokenHash" = ${tokenHash}
      FOR UPDATE
    `;
    const inv = locked[0];
    if (!inv) fail("INVALID_TOKEN");
    if (inv.consumedAt) {
      if (inv.consumedById === options.userId) {
        return { alreadyAccepted: true as const, workspaceId: inv.workspaceId };
      }
      fail("TOKEN_USED");
    }
    if (inv.revokedAt) fail("TOKEN_REVOKED");
    if (new Date(inv.expiresAt).getTime() <= Date.now()) fail("TOKEN_EXPIRED");

    if (inv.recipientEmail) {
      if (user.email.toLowerCase() !== inv.recipientEmail.toLowerCase()) fail("WRONG_ACCOUNT");
      if (!(await isEmailVerified(options.userId))) fail("EMAIL_NOT_VERIFIED");
    }

    await tx.employerMembershipInvitation.update({
      where: { id: inv.id },
      data: { consumedAt: new Date(), consumedById: options.userId },
    });

    await tx.employerWorkspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: inv.workspaceId, userId: options.userId },
      },
      create: {
        workspaceId: inv.workspaceId,
        userId: options.userId,
        role: inv.role,
        status: "ACTIVE",
      },
      update: {
        role: inv.role,
        status: "ACTIVE",
        removedAt: null,
      },
    });

    // Does not grant speaker/host/staff capabilities.
    return {
      alreadyAccepted: false as const,
      workspaceId: inv.workspaceId,
      role: inv.role,
      invitationId: inv.id,
      createdById: inv.createdById,
    };
  });

  if (!result.alreadyAccepted && "createdById" in result && result.createdById) {
    const { createNotification } = await import("@/lib/notifications/service");
    await createNotification({
      userId: result.createdById,
      kind: "employer_invitation_accepted",
      title: "İşveren daveti kabul edildi",
      body: "Bir üye işveren çalışma alanı davetini kabul etti.",
      href: "/isveren",
      payload: { workspaceId: result.workspaceId, invitationId: result.invitationId },
      dedupeKey: `employer_invitation_accepted:${result.invitationId}`,
    });
  }

  return result;
}
