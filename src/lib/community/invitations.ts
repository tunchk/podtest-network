import { prisma } from "@/lib/db";
import type { SpeakerInvitationPurpose } from "@/generated/prisma/client";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  isEmailVerified,
} from "@/lib/auth/email-verification";
import { SPEAKER_INVITATION_TTL_HOURS } from "@/lib/community/constants";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

async function requireAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { staffRole: true },
  });
  if (!user || user.staffRole !== "ADMIN") fail("FORBIDDEN");
}

/**
 * Admin creates a single-use invitation. Returns plaintext token once for link copy.
 * Token hash is stored; plaintext must not be logged.
 */
export async function createSpeakerInvitation(options: {
  adminId: string;
  recipientEmail?: string | null;
  purpose: SpeakerInvitationPurpose;
  episodeId?: string | null;
  note?: string | null;
  ttlHours?: number;
}) {
  await requireAdmin(options.adminId);

  if (options.purpose === "EPISODE_ASSOCIATION") {
    if (!options.episodeId) fail("EPISODE_REQUIRED");
    const episode = await prisma.podcastEpisode.findUnique({
      where: { id: options.episodeId },
    });
    if (!episode || episode.publicationState === "REMOVED") fail("EPISODE_NOT_AVAILABLE");
  }

  const plaintext = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(plaintext);
  const expiresAt = new Date(
    Date.now() + (options.ttlHours ?? SPEAKER_INVITATION_TTL_HOURS) * 60 * 60 * 1000,
  );

  const invitation = await prisma.speakerInvitation.create({
    data: {
      createdById: options.adminId,
      recipientEmail: options.recipientEmail?.trim().toLowerCase() || null,
      purpose: options.purpose,
      episodeId: options.episodeId || null,
      tokenHash,
      expiresAt,
      note: options.note?.trim() || null,
    },
  });

  return {
    invitation: {
      id: invitation.id,
      recipientEmail: invitation.recipientEmail,
      purpose: invitation.purpose,
      episodeId: invitation.episodeId,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    },
    // One-time plaintext for admin copy — never persist or log.
    acceptPath: `/davet/konusmaci?token=${plaintext}`,
    plaintextToken: plaintext,
  };
}

export async function revokeSpeakerInvitation(options: {
  adminId: string;
  invitationId: string;
}) {
  await requireAdmin(options.adminId);
  const inv = await prisma.speakerInvitation.findUnique({ where: { id: options.invitationId } });
  if (!inv) fail("NOT_FOUND");
  if (inv.consumedAt) fail("ALREADY_CONSUMED");
  return prisma.speakerInvitation.update({
    where: { id: inv.id },
    data: { revokedAt: new Date() },
  });
}

export async function listSpeakerInvitations(adminId: string) {
  await requireAdmin(adminId);
  const rows = await prisma.speakerInvitation.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      recipientEmail: true,
      purpose: true,
      episodeId: true,
      expiresAt: true,
      revokedAt: true,
      consumedAt: true,
      consumedById: true,
      note: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    status: r.consumedAt
      ? "CONSUMED"
      : r.revokedAt
        ? "REVOKED"
        : r.expiresAt.getTime() <= Date.now()
          ? "EXPIRED"
          : "OPEN",
  }));
}

/**
 * Atomic, idempotent acceptance. Concurrent accepts grant rights once.
 * Does not grant staff, moderator, host, employer, or paid-plan privileges.
 */
export async function acceptSpeakerInvitation(options: {
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
    // Serialize on the invitation row.
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        recipientEmail: string | null;
        purpose: SpeakerInvitationPurpose;
        episodeId: string | null;
        expiresAt: Date;
        revokedAt: Date | null;
        consumedAt: Date | null;
        consumedById: string | null;
      }>
    >`
      SELECT id, "recipientEmail", purpose, "episodeId", "expiresAt", "revokedAt", "consumedAt", "consumedById"
      FROM speaker_invitation
      WHERE "tokenHash" = ${tokenHash}
      FOR UPDATE
    `;

    const inv = locked[0];
    if (!inv) fail("INVALID_TOKEN");

    if (inv.consumedAt) {
      if (inv.consumedById === options.userId) {
        return { alreadyAccepted: true as const, invitationId: inv.id };
      }
      fail("TOKEN_USED");
    }
    if (inv.revokedAt) fail("TOKEN_REVOKED");
    if (new Date(inv.expiresAt).getTime() <= Date.now()) fail("TOKEN_EXPIRED");

    if (inv.recipientEmail) {
      if (user.email.toLowerCase() !== inv.recipientEmail.toLowerCase()) {
        fail("WRONG_ACCOUNT");
      }
      if (!(await isEmailVerified(options.userId))) {
        // Re-read inside tx for honesty
        const fresh = await tx.user.findUnique({
          where: { id: options.userId },
          select: { emailVerified: true },
        });
        if (!fresh?.emailVerified) fail("EMAIL_NOT_VERIFIED");
      }
    }

    await tx.speakerInvitation.update({
      where: { id: inv.id },
      data: {
        consumedAt: new Date(),
        consumedById: options.userId,
      },
    });

    if (inv.purpose === "SPEAKER_STATUS") {
      await tx.profile.update({
        where: { userId: options.userId },
        data: { speakerParticipation: true },
      });
    }

    if (inv.purpose === "EPISODE_ASSOCIATION" && inv.episodeId) {
      await tx.episodeAppearance.upsert({
        where: {
          episodeId_memberUserId: {
            episodeId: inv.episodeId,
            memberUserId: options.userId,
          },
        },
        create: {
          episodeId: inv.episodeId,
          memberUserId: options.userId,
          status: "CONFIRMED",
          requestedBy: "ADMIN",
          proposedById: null,
          adminVerifiedAt: new Date(),
          memberAcceptedAt: new Date(),
        },
        update: {
          status: "CONFIRMED",
          adminVerifiedAt: new Date(),
          memberAcceptedAt: new Date(),
          rejectedAt: null,
          revokedAt: null,
        },
      });
      await tx.profile.update({
        where: { userId: options.userId },
        data: { speakerParticipation: true },
      });
    }

    return { alreadyAccepted: false as const, invitationId: inv.id, purpose: inv.purpose };
  });

  // After successful first accept — notify invitation creator (admin).
  // Decline-by-invitee has no hook in this flow.
  if (!result.alreadyAccepted) {
    const { createNotification } = await import("@/lib/notifications/service");
    const invRow = await prisma.speakerInvitation.findUnique({
      where: { id: result.invitationId },
      select: { createdById: true },
    });
    if (invRow?.createdById) {
      await createNotification({
        userId: invRow.createdById,
        kind: "speaker_invitation_accepted",
        title: "Konuşmacı daveti kabul edildi",
        body: "Bir konuşmacı daveti kabul edildi.",
        href: "/yonetim",
        payload: { invitationId: result.invitationId, purpose: result.purpose },
        dedupeKey: `speaker_invitation_accepted:${result.invitationId}`,
      });
    }
  }

  return result;
}
