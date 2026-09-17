import { prisma } from "@/lib/db";
import { assignHost } from "@/lib/arayanlar/service";
import {
  hostHandoffIdempotencyKey,
  hostPrepNotesPath,
  resolveDefaultKariyerPortresiHost,
} from "@/lib/arayanlar/default-host";
import { ensureConversationForPair, sendMessage } from "@/lib/messaging/conversations";
import type { SubmittedFacts } from "@/lib/arayanlar/constants";

export type HostHandoffResult =
  | {
      ok: true;
      alreadySent: boolean;
      conversationId: string;
      hostNotesPath: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

function buildHandoffBody(options: {
  candidateName: string;
  applicationId: string;
}) {
  const path = hostPrepNotesPath(options.applicationId);
  return [
    "Kariyer Portresi kayıt notları hazır",
    "",
    `${options.candidateName} için kayıt öncesi notlar hazır.`,
    "",
    `Host notları: ${path}`,
  ].join("\n");
}

/**
 * Send one internal message to the fixed default host with a link to host-safe notes.
 * Idempotent per applicationId + revision + hostUserId.
 * Does not call OpenAI and does not change prepStatus.
 */
export async function sendKariyerPortresiHostHandoff(options: {
  candidateUserId: string;
}): Promise<HostHandoffResult> {
  const host = await resolveDefaultKariyerPortresiHost();
  if (!host.ok) {
    return { ok: false, code: host.code, message: host.message };
  }

  const app = await prisma.arayanlarApplication.findUnique({
    where: { userId: options.candidateUserId },
  });
  if (!app) {
    return { ok: false, code: "NOT_FOUND", message: "Başvuru bulunamadı." };
  }
  if (app.status !== "SUBMITTED" || app.prepStatus !== "READY") {
    return {
      ok: false,
      code: "NOT_READY",
      message: "Kayıt öncesi notlar henüz hazır değil.",
    };
  }
  if (app.submittedRevision < 1) {
    return { ok: false, code: "NOT_READY", message: "Kayıt öncesi notlar henüz hazır değil." };
  }

  const artifact = await prisma.arayanlarArtifact.findUnique({
    where: {
      applicationId_kind_submittedRevision: {
        applicationId: app.id,
        kind: "HOST_PACK",
        submittedRevision: app.submittedRevision,
      },
    },
    select: { id: true },
  });
  if (!artifact) {
    return { ok: false, code: "MISSING_NOTES", message: "Host notları bulunamadı." };
  }

  if (host.userId === options.candidateUserId) {
    return {
      ok: false,
      code: "SELF_HOST",
      message: "Host’a mesaj gönderilemedi. Lütfen daha sonra tekrar dene.",
    };
  }

  // Ensure the fixed host can open the host-safe notes route (assignment-gated today).
  if (app.assignedHostUserId !== host.userId) {
    try {
      await assignHost({
        applicationId: app.id,
        hostUserId: host.userId,
        assignedByUserId: options.candidateUserId,
      });
    } catch {
      return {
        ok: false,
        code: "HOST_ASSIGN_FAILED",
        message: "Host’a mesaj gönderilemedi. Lütfen daha sonra tekrar dene.",
      };
    }
  }

  const facts = app.submittedFacts as SubmittedFacts | null;
  const candidateName =
    facts?.displayName?.trim() ||
    (
      await prisma.user.findUnique({
        where: { id: options.candidateUserId },
        select: { name: true },
      })
    )?.name?.trim() ||
    "Aday";

  const body = buildHandoffBody({
    candidateName,
    applicationId: app.id,
  });
  const idempotencyKey = hostHandoffIdempotencyKey({
    applicationId: app.id,
    revision: app.submittedRevision,
    hostUserId: host.userId,
  });
  const notesPath = hostPrepNotesPath(app.id);

  try {
    const conversation = await prisma.$transaction(async (tx) => {
      return ensureConversationForPair({
        userA: options.candidateUserId,
        userB: host.userId,
        tx,
        activate: true,
      });
    });

    const sent = await sendMessage({
      conversationId: conversation.id,
      senderId: options.candidateUserId,
      body,
      idempotencyKey,
    });

    if (sent.kind === "held") {
      return {
        ok: false,
        code: "MESSAGE_HELD",
        message: "Mesaj inceleme için bekletildi. Lütfen daha sonra tekrar dene.",
      };
    }

    return {
      ok: true,
      alreadySent: sent.kind === "existing",
      conversationId: conversation.id,
      hostNotesPath: notesPath,
    };
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: string }).code)
        : error instanceof Error
          ? error.message
          : "SEND_FAILED";
    const friendly: Record<string, string> = {
      NOT_AVAILABLE: "Host’a mesaj gönderilemedi.",
      MESSAGING_PAUSED: "Mesajlaşma şu an kapalı.",
      MESSAGING_RESTRICTED: "Mesajlaşma geçici olarak kısıtlı.",
      RATE_LIMITED: "Çok hızlı denedin. Kısa bir süre sonra tekrar dene.",
      CONTENT_REJECTED: "Mesaj içeriği gönderilemedi.",
      IDEMPOTENCY_CONFLICT: "Mesaj daha önce farklı içerikle kaydedilmiş.",
    };
    return {
      ok: false,
      code,
      message: friendly[code] ?? "Host’a mesaj gönderilemedi. Lütfen daha sonra tekrar dene.",
    };
  }
}
