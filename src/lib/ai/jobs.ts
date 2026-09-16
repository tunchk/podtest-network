import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import {
  PROFILE_PREPARE_CREDIT_COST,
  ensureSponsoredProfilePrepareGrant,
  getAvailableCreditBalance,
  getAvailableCreditBalanceForArayanlar,
  releaseJobReservation,
  reserveCreditsForJob,
  settleJobReservation,
} from "@/lib/credits/ledger";
import { assertOwnedCv, readCvExtractedText } from "@/lib/cv/service";
import { ensurePrivateDirs, getPrivateStorageRoot } from "@/lib/storage/paths";
import { prepareProfileFromCv } from "@/lib/ai/provider";
import { profileSuggestionSchema } from "@/lib/ai/suggestion-schema";
import { draftFromProfile } from "@/lib/profiles/types";
import { updateOwnedProfileDraft } from "@/lib/profiles/service";
import { sanitizeExternalUrl } from "@/lib/security/urls";
import { generateArayanlarPreparation } from "@/lib/arayanlar/provider";
import { arayanlarPrepareOutputSchema } from "@/lib/arayanlar/artifact-schema";
import type { SubmittedFacts } from "@/lib/arayanlar/constants";
import type { Prisma } from "@/generated/prisma/client";
import { isUnlimitedAiUsage } from "@/lib/ai/usage-policy";

export async function quoteProfilePrepare(userId: string) {
  const unlimited = await isUnlimitedAiUsage(userId);
  if (unlimited) {
    const available = await getAvailableCreditBalanceForArayanlar(userId);
    return {
      cost: PROFILE_PREPARE_CREDIT_COST,
      available,
      canAfford: true,
      currencyLabel: "AI kredisi",
      unlimitedInternal: true as const,
    };
  }
  await ensureSponsoredProfilePrepareGrant(userId);
  const available = await getAvailableCreditBalance(userId);
  return {
    cost: PROFILE_PREPARE_CREDIT_COST,
    available,
    canAfford: available >= PROFILE_PREPARE_CREDIT_COST,
    currencyLabel: "AI kredisi",
    unlimitedInternal: false as const,
  };
}

export async function createProfilePrepareJob(options: {
  userId: string;
  cvDocumentId: string;
}) {
  const profile = await prisma.profile.findUnique({ where: { userId: options.userId } });
  if (!profile) throw new Error("Profile missing");

  const cv = await assertOwnedCv(options.cvDocumentId, options.userId);
  if (cv.extractionStatus !== "OK") {
    throw new Error("CV_NOT_READY");
  }

  const text = await readCvExtractedText(cv.id, options.userId);
  if (!text) throw new Error("CV_TEXT_MISSING");

  const unlimited = await isUnlimitedAiUsage(options.userId);
  if (!unlimited) {
    await ensureSponsoredProfilePrepareGrant(options.userId);
  }
  await ensurePrivateDirs();

  const jobId = randomUUID().replace(/-/g, "").slice(0, 24);
  const inputRelative = path.join("job-inputs", `job-${jobId}.txt`);
  await writeFile(path.join(getPrivateStorageRoot(), inputRelative), text, "utf8");

  const creditCost = unlimited ? 0 : PROFILE_PREPARE_CREDIT_COST;

  try {
    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.aiJob.create({
        data: {
          id: jobId,
          userId: options.userId,
          profileId: profile.id,
          kind: "PROFILE_PREPARE",
          status: "QUEUED",
          cvDocumentId: cv.id,
          inputTextRelativePath: inputRelative,
          profileDraftRevision: profile.draftRevision,
          creditCostSnapshot: creditCost,
          maxAttempts: 3,
        },
      });

      if (unlimited) {
        return created;
      }

      const reservation = await reserveCreditsForJob({
        userId: options.userId,
        jobId: created.id,
        amount: PROFILE_PREPARE_CREDIT_COST,
        tx,
      });

      return tx.aiJob.update({
        where: { id: created.id },
        data: { reservationEntryId: reservation.id },
      });
    });

    return job;
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") {
      await prisma.aiJob
        .update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            safeErrorCode: "insufficient_credits",
            safeErrorMessage: "Yeterli AI krediniz yok.",
            finishedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
    throw error;
  }
}

export async function getOwnedJob(jobId: string, userId: string) {
  return prisma.aiJob.findFirst({ where: { id: jobId, userId } });
}

export async function cancelOwnedJob(jobId: string, userId: string) {
  const job = await getOwnedJob(jobId, userId);
  if (!job) throw new Error("Not found");
  if (job.status === "READY" || job.status === "CANCELLED") {
    return job;
  }

  // Abandon a retryable FAILED job and return any still-held reservation.
  if (job.status === "FAILED") {
    await releaseJobReservation(jobId);
    return getOwnedJob(jobId, userId);
  }

  const updated = await prisma.aiJob.updateMany({
    where: {
      id: jobId,
      userId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      finishedAt: new Date(),
      safeErrorCode: "cancelled",
      safeErrorMessage: "İş iptal edildi.",
    },
  });

  if (updated.count > 0) {
    await releaseJobReservation(jobId);
  }

  return getOwnedJob(jobId, userId);
}

export async function requestJobRetry(jobId: string, userId: string) {
  const job = await getOwnedJob(jobId, userId);
  if (!job) throw new Error("Not found");
  if (job.status !== "FAILED") {
    throw new Error("Not retryable");
  }
  if (job.attemptCount >= job.maxAttempts) {
    throw new Error("Max attempts");
  }

  const reserve = await prisma.creditLedgerEntry.findUnique({
    where: { idempotencyKey: `reserve:${jobId}` },
  });
  const settled = await prisma.creditLedgerEntry.findUnique({
    where: { idempotencyKey: `settle:${jobId}` },
  });
  const released = await prisma.creditLedgerEntry.findUnique({
    where: { idempotencyKey: `release:${jobId}` },
  });

  if (settled) throw new Error("Already settled");

  // Retryable failures keep the original reservation held. Never create a second RESERVE
  // (would be a new charge) and never call reserveCreditsForJob after RELEASE (idempotent
  // reserve:${jobId} would return the old row without restoring lot.reservedAmount).
  if (job.creditCostSnapshot > 0) {
    if (!reserve) {
      throw new Error("Missing reservation");
    }
    if (released) {
      throw new Error("Reservation released");
    }
  }

  return prisma.aiJob.update({
    where: { id: jobId },
    data: {
      status: "QUEUED",
      safeErrorCode: null,
      safeErrorMessage: null,
      finishedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
}

const LEASE_MS = 120_000;

export async function claimNextJob(workerId: string) {
  const now = new Date();
  const leaseExpires = new Date(now.getTime() + LEASE_MS);
  let releaseId: string | null = null;

  const job = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM ai_job
      WHERE status = CAST('QUEUED' AS "AiJobStatus")
         OR (
           status = CAST('RUNNING' AS "AiJobStatus")
           AND "leaseExpiresAt" IS NOT NULL
           AND "leaseExpiresAt" < ${now}
         )
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;

    const id = rows[0]?.id;
    if (!id) return null;

    const current = await tx.aiJob.findUnique({ where: { id } });
    if (!current) return null;
    if (current.status === "CANCELLED" || current.status === "READY" || current.status === "FAILED") {
      return null;
    }

    if (current.attemptCount >= current.maxAttempts) {
      await tx.aiJob.update({
        where: { id },
        data: {
          status: "FAILED",
          safeErrorCode: "max_attempts",
          safeErrorMessage: "Azami deneme sayısına ulaşıldı.",
          finishedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      releaseId = id;
      return null;
    }

    return tx.aiJob.update({
      where: { id },
      data: {
        status: "RUNNING",
        leaseOwner: workerId,
        leaseExpiresAt: leaseExpires,
        attemptCount: { increment: 1 },
        startedAt: current.startedAt ?? now,
      },
    });
  });

  if (releaseId) {
    await releaseJobReservation(releaseId);
  }
  return job;
}

export async function processClaimedJob(jobId: string, workerId: string) {
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!job || job.leaseOwner !== workerId) return;
  if (job.status === "CANCELLED") {
    await releaseJobReservation(jobId);
    return;
  }

  if (job.kind === "ARAYANLAR_PREPARE") {
    await processArayanlarPrepareJob(jobId, workerId);
    return;
  }

  await processProfilePrepareJob(jobId, workerId);
}

async function processProfilePrepareJob(jobId: string, workerId: string) {
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!job || job.leaseOwner !== workerId) return;
  if (job.status === "CANCELLED") {
    await releaseJobReservation(jobId);
    return;
  }

  if (!job.profileId) {
    await failJob(jobId, "profile_missing", "Profil bulunamadı.");
    return;
  }

  const profile = await prisma.profile.findUnique({ where: { id: job.profileId } });
  if (!profile) {
    await failJob(jobId, "profile_missing", "Profil bulunamadı.");
    return;
  }

  const { readFile } = await import("node:fs/promises");
  const { jobInputPath } = await import("@/lib/storage/paths");
  let cvText = "";
  try {
    if (!job.inputTextRelativePath) throw new Error("missing input");
    cvText = await readFile(jobInputPath(job.inputTextRelativePath), "utf8");
  } catch {
    await failJob(jobId, "input_missing", "İş girdisi okunamadı.");
    return;
  }

  // Refresh lease mid-flight
  await prisma.aiJob.updateMany({
    where: { id: jobId, leaseOwner: workerId, status: "RUNNING" },
    data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
  });

  const result = await prepareProfileFromCv({
    cvText,
    currentProfile: {
      displayName: profile.displayName,
      headline: profile.headline,
      bio: profile.bio,
      skills: profile.skills,
    },
  });

  // Late response after cancel: do not publish results or settle as success
  const latest = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!latest || latest.status === "CANCELLED") {
    await releaseJobReservation(jobId);
    return;
  }
  if (latest.leaseOwner !== workerId) {
    // Stale worker — do not overwrite
    return;
  }

  if (!result.ok) {
    if (latest.attemptCount >= latest.maxAttempts || result.code === "provider_unavailable") {
      await failJob(jobId, result.code, result.message, result.mode);
    } else {
      await prisma.aiJob.update({
        where: { id: jobId },
        data: {
          status: "QUEUED",
          leaseOwner: null,
          leaseExpiresAt: null,
          safeErrorCode: result.code,
          safeErrorMessage: result.message,
          providerMode: result.mode,
        },
      });
    }
    return;
  }

  const conflict = profile.draftRevision !== job.profileDraftRevision;

  await prisma.aiJob.update({
    where: { id: jobId },
    data: {
      status: "READY",
      resultJson: result.suggestions as unknown as Prisma.InputJsonValue,
      resultConflict: conflict,
      providerMode: result.mode,
      finishedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
      safeErrorCode: null,
      safeErrorMessage: conflict
        ? "Profil işlem sırasında değişti. Önerileri dikkatle gözden geçirin; mevcut taslak korunur."
        : null,
    },
  });

  await settleJobReservation(jobId);
}

/**
 * Atomic dual-artifact completion for Arayanlar.
 * Partial failure must not mark preparation READY or settle guest credits (except platform regen cost 0).
 */
async function processArayanlarPrepareJob(jobId: string, workerId: string) {
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!job || job.leaseOwner !== workerId) return;
  if (job.status === "CANCELLED") {
    if (job.creditCostSnapshot > 0) await releaseJobReservation(jobId);
    return;
  }

  if (!job.arayanlarApplicationId) {
    await failArayanlarJob(jobId, "application_missing", "Başvuru bulunamadı.", job.creditCostSnapshot > 0);
    return;
  }

  const application = await prisma.arayanlarApplication.findUnique({
    where: { id: job.arayanlarApplicationId },
  });
  if (!application) {
    await failArayanlarJob(jobId, "application_missing", "Başvuru bulunamadı.", job.creditCostSnapshot > 0);
    return;
  }

  // Withdrawal / late results: ignore publication
  if (application.status === "WITHDRAWN") {
    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        finishedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        safeErrorCode: "withdrawn",
        safeErrorMessage: "Başvuru geri çekildi; sonuç yayımlanmadı.",
      },
    });
    if (job.creditCostSnapshot > 0) await releaseJobReservation(jobId);
    return;
  }

  // Host regen jobs are marked at creation (platform_host_regen) and cost 0.
  // Guest UNLIMITED_INTERNAL prepares also cost 0 — do NOT treat cost alone as host regen,
  // or prepStatus/READY notifications never update for unlimited members.
  const isHostRegen = job.providerMode === "platform_host_regen";
  const revision = isHostRegen ? application.submittedRevision : job.profileDraftRevision;

  if (!isHostRegen && application.submittedRevision !== revision) {
    const failed = await failArayanlarJob(
      jobId,
      "revision_mismatch",
      "Gönderim revizyonu değişti; sonuç yayımlanmadı.",
      true,
    );
    await prisma.arayanlarApplication.update({
      where: { id: application.id },
      data: { prepStatus: "FAILED" },
    });
    await notifyGuestPrepFailedIfActionable({
      userId: application.userId,
      applicationId: application.id,
      revision: application.submittedRevision,
      job: failed,
      isHostRegen,
    });
    return;
  }

  const facts = application.submittedFacts as SubmittedFacts | null;
  if (!facts) {
    await failArayanlarJob(jobId, "facts_missing", "Onaylı gerçekler eksik.", job.creditCostSnapshot > 0);
    return;
  }

  await prisma.arayanlarApplication.update({
    where: { id: application.id },
    data: { prepStatus: isHostRegen ? application.prepStatus : "RUNNING" },
  });

  await prisma.aiJob.updateMany({
    where: { id: jobId, leaseOwner: workerId, status: "RUNNING" },
    data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
  });

  const result = await generateArayanlarPreparation({
    facts,
    editorialTemplateVersion: application.editorialTemplateVersion,
  });

  const latest = await prisma.aiJob.findUnique({ where: { id: jobId } });
  const latestApp = await prisma.arayanlarApplication.findUnique({
    where: { id: application.id },
  });
  if (!latest || latest.status === "CANCELLED" || latestApp?.status === "WITHDRAWN") {
    if (job.creditCostSnapshot > 0) await releaseJobReservation(jobId);
    return;
  }
  if (latest.leaseOwner !== workerId) return;

  if (!result.ok) {
    if (latest.attemptCount >= latest.maxAttempts || result.code === "provider_unavailable") {
      const failed = await failArayanlarJob(
        jobId,
        result.code,
        result.message,
        job.creditCostSnapshot > 0,
        result.mode,
      );
      if (!isHostRegen) {
        await prisma.arayanlarApplication.update({
          where: { id: application.id },
          data: { prepStatus: "FAILED" },
        });
        await notifyGuestPrepFailedIfActionable({
          userId: application.userId,
          applicationId: application.id,
          revision,
          job: failed,
          isHostRegen,
        });
      }
    } else {
      // Internal automatic retry — requeue only; no inbox notification.
      await prisma.aiJob.update({
        where: { id: jobId },
        data: {
          status: "QUEUED",
          leaseOwner: null,
          leaseExpiresAt: null,
          safeErrorCode: result.code,
          safeErrorMessage: result.message,
          providerMode: result.mode,
        },
      });
      if (!isHostRegen) {
        await prisma.arayanlarApplication.update({
          where: { id: application.id },
          data: { prepStatus: "QUEUED" },
        });
      }
    }
    return;
  }

  const validated = arayanlarPrepareOutputSchema.safeParse(result.output);
  if (!validated.success) {
    const failed = await failArayanlarJob(
      jobId,
      "schema_mismatch",
      "Çıktı doğrulanamadı.",
      job.creditCostSnapshot > 0,
      result.mode,
    );
    if (!isHostRegen) {
      await prisma.arayanlarApplication.update({
        where: { id: application.id },
        data: { prepStatus: "FAILED" },
      });
      await notifyGuestPrepFailedIfActionable({
        userId: application.userId,
        applicationId: application.id,
        revision,
        job: failed,
        isHostRegen,
      });
    }
    return;
  }

  // Atomic completion: both artifacts + job READY (+ settle) or nothing published as ready.
  try {
    await prisma.$transaction(async (tx) => {
      const appNow = await tx.arayanlarApplication.findUnique({ where: { id: application.id } });
      if (!appNow || appNow.status === "WITHDRAWN") {
        throw new Error("WITHDRAWN");
      }
      if (!isHostRegen && appNow.submittedRevision !== revision) {
        throw new Error("REVISION");
      }

      const existingHost = await tx.arayanlarArtifact.findUnique({
        where: {
          applicationId_kind_submittedRevision: {
            applicationId: application.id,
            kind: "HOST_PACK",
            submittedRevision: revision,
          },
        },
      });

      await tx.arayanlarArtifact.upsert({
        where: {
          applicationId_kind_submittedRevision: {
            applicationId: application.id,
            kind: "GUEST_BRIEF",
            submittedRevision: revision,
          },
        },
        create: {
          applicationId: application.id,
          kind: "GUEST_BRIEF",
          submittedRevision: revision,
          editorialTemplateVersion: appNow.editorialTemplateVersion,
          generatedJson: validated.data.guestBrief as unknown as Prisma.InputJsonValue,
        },
        update: isHostRegen
          ? {}
          : {
              generatedJson: validated.data.guestBrief as unknown as Prisma.InputJsonValue,
              editorialTemplateVersion: appNow.editorialTemplateVersion,
            },
      });

      await tx.arayanlarArtifact.upsert({
        where: {
          applicationId_kind_submittedRevision: {
            applicationId: application.id,
            kind: "HOST_PACK",
            submittedRevision: revision,
          },
        },
        create: {
          applicationId: application.id,
          kind: "HOST_PACK",
          submittedRevision: revision,
          editorialTemplateVersion: appNow.editorialTemplateVersion,
          generatedJson: validated.data.hostPack as unknown as Prisma.InputJsonValue,
        },
        update: {
          generatedJson: validated.data.hostPack as unknown as Prisma.InputJsonValue,
          editorialTemplateVersion: appNow.editorialTemplateVersion,
          // Preserve host edits on regeneration
          hostEditedJson: existingHost?.hostEditedJson ?? undefined,
        },
      });

      await tx.aiJob.update({
        where: { id: jobId },
        data: {
          status: "READY",
          // Guest-safe summary only — never embed host pack in job.resultJson
          resultJson: {
            guestBriefReady: true,
            hostPackReady: true,
            submittedRevision: revision,
            labeledStub: result.labeledStub,
          } as Prisma.InputJsonValue,
          providerMode: result.mode,
          finishedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          safeErrorCode: null,
          safeErrorMessage: null,
        },
      });

      if (!isHostRegen) {
        await tx.arayanlarApplication.update({
          where: { id: application.id },
          data: { prepStatus: "READY" },
        });
      }
    });
  } catch {
    const failed = await failArayanlarJob(
      jobId,
      "persist_failed",
      "Hazırlık kaydedilemedi.",
      job.creditCostSnapshot > 0,
      result.mode,
    );
    if (!isHostRegen) {
      await prisma.arayanlarApplication.update({
        where: { id: application.id },
        data: { prepStatus: "FAILED" },
      });
      await notifyGuestPrepFailedIfActionable({
        userId: application.userId,
        applicationId: application.id,
        revision,
        job: failed,
        isHostRegen,
      });
    }
    return;
  }

  if (!isHostRegen) {
    const { notifyArayanlarPrepReady } = await import("@/lib/arayanlar/notifications");
    await notifyArayanlarPrepReady({
      userId: application.userId,
      applicationId: application.id,
      revision,
    });
  }

  if (job.creditCostSnapshot > 0) {
    await settleJobReservation(jobId);
  }
}

async function failArayanlarJob(
  jobId: string,
  code: string,
  message: string,
  releaseCredits: boolean,
  mode?: string,
) {
  const updated = await prisma.aiJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      safeErrorCode: code,
      safeErrorMessage: message,
      providerMode: mode ?? null,
      finishedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  // Keep the original reservation for retryable failures; release only when exhausted
  // (or when caller opts out of retries by passing releaseCredits with max attempts).
  if (
    releaseCredits &&
    updated.creditCostSnapshot > 0 &&
    updated.attemptCount >= updated.maxAttempts
  ) {
    await releaseJobReservation(jobId);
  }
  return updated;
}

/** Notify only when guest prep is FAILED and the member can still retry manually. */
async function notifyGuestPrepFailedIfActionable(options: {
  userId: string;
  applicationId: string;
  revision: number;
  job: { id: string; attemptCount: number; maxAttempts: number; status: string };
  isHostRegen: boolean;
}) {
  if (options.isHostRegen) return;
  if (options.job.status !== "FAILED") return;
  const { notifyArayanlarPrepFailedRetryable } = await import("@/lib/arayanlar/notifications");
  await notifyArayanlarPrepFailedRetryable({
    userId: options.userId,
    applicationId: options.applicationId,
    revision: options.revision,
    attemptCount: options.job.attemptCount,
    maxAttempts: options.job.maxAttempts,
  });
}

async function failJob(jobId: string, code: string, message: string, mode?: string) {
  const updated = await prisma.aiJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      safeErrorCode: code,
      safeErrorMessage: message,
      providerMode: mode ?? null,
      finishedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  // Retryable FAILED keeps the same reserved credits; only terminal (max attempts) releases.
  if (updated.creditCostSnapshot > 0 && updated.attemptCount >= updated.maxAttempts) {
    await releaseJobReservation(jobId);
  }
}

export async function applyJobSuggestions(options: {
  userId: string;
  jobId: string;
  acceptedFields: string[];
  edits: Record<string, unknown>;
  expectedDraftRevision: number;
}) {
  const job = await getOwnedJob(options.jobId, options.userId);
  if (!job || job.status !== "READY" || !job.resultJson) {
    throw new Error("Job not ready");
  }

  const profile = await prisma.profile.findUnique({ where: { userId: options.userId } });
  if (!profile) throw new Error("Profile missing");

  if (profile.draftRevision !== options.expectedDraftRevision) {
    const err = new Error("CONFLICT") as Error & { currentDraftRevision?: number };
    err.currentDraftRevision = profile.draftRevision;
    throw err;
  }

  if (!options.acceptedFields.length) {
    throw new Error("NO_SELECTION");
  }

  const parsed = profileSuggestionSchema.safeParse(job.resultJson);
  if (!parsed.success) {
    throw new Error("Malformed suggestions");
  }

  const suggestions = parsed.data.fields;
  const patch: Parameters<typeof updateOwnedProfileDraft>[1] = {};

  const accept = (field: string) => options.acceptedFields.includes(field);

  if (accept("displayName")) {
    const edited = options.edits.displayName;
    const value =
      typeof edited === "string"
        ? edited
        : suggestions.displayName?.value ?? undefined;
    if (value && value.trim()) patch.displayName = value.trim();
  }
  if (accept("headline")) {
    const edited = options.edits.headline;
    const value = typeof edited === "string" ? edited : suggestions.headline?.value;
    if (value !== undefined && value !== null && String(value).trim()) {
      patch.headline = String(value).trim();
    }
  }
  if (accept("bio")) {
    const edited = options.edits.bio;
    const value = typeof edited === "string" ? edited : suggestions.bio?.value;
    if (value !== undefined && value !== null && String(value).trim()) {
      patch.bio = String(value).trim();
    }
  }
  if (accept("skills")) {
    const edited = options.edits.skills;
    const value = Array.isArray(edited)
      ? edited.map(String)
      : suggestions.skills?.value;
    if (value && value.length) patch.skills = value;
  }
  if (accept("interests")) {
    const edited = options.edits.interests;
    const value = Array.isArray(edited)
      ? edited.map(String)
      : suggestions.interests?.value;
    if (value && value.length) patch.interests = value;
  }
  if (accept("experience")) {
    const edited = options.edits.experience;
    const value = typeof edited === "string" ? edited : suggestions.experience?.value;
    if (value !== undefined && value !== null && String(value).trim()) {
      patch.experience = String(value).trim();
    }
  }
  if (accept("education")) {
    const edited = options.edits.education;
    const value = typeof edited === "string" ? edited : suggestions.education?.value;
    if (value !== undefined && value !== null && String(value).trim()) {
      patch.education = String(value).trim();
    }
  }
  if (accept("projects")) {
    const edited = options.edits.projects;
    const value = typeof edited === "string" ? edited : suggestions.projects?.value;
    if (value !== undefined && value !== null && String(value).trim()) {
      patch.projects = String(value).trim();
    }
  }
  if (accept("languages")) {
    const edited = options.edits.languages;
    const value = Array.isArray(edited)
      ? edited.map(String)
      : suggestions.languages?.value;
    if (value && value.length) patch.languages = value;
  }
  if (accept("location")) {
    const edited = options.edits.location;
    const value = typeof edited === "string" ? edited : suggestions.location?.value;
    if (value !== undefined && value !== null && String(value).trim()) {
      patch.location = String(value).trim();
    }
  }
  if (accept("workPreferences")) {
    const edited = options.edits.workPreferences;
    const value =
      typeof edited === "string" ? edited : suggestions.workPreferences?.value;
    if (value !== undefined && value !== null && String(value).trim()) {
      patch.workPreferences = String(value).trim();
    }
  }
  if (accept("publicLinks")) {
    const edited = options.edits.publicLinks;
    const raw = Array.isArray(edited)
      ? edited
      : suggestions.publicLinks?.value ?? [];
    const links = (raw as { url?: string }[])
      .map((item) => sanitizeExternalUrl(item.url ?? ""))
      .filter((url): url is string => Boolean(url))
      .map((url) => ({ url }));
    if (links.length) patch.publicLinks = links;
  }

  // Empty extracted fields must not erase existing content — only apply non-empty patches.
  // Do not bump draftRevision when nothing would change (avoids false "applied" success).
  if (Object.keys(patch).length === 0) {
    throw new Error("NO_SELECTION");
  }

  const publicBefore = profile.publicSnapshot;
  const updated = await updateOwnedProfileDraft(options.userId, patch);
  // Never touch publicSnapshot here
  const still = await prisma.profile.findUniqueOrThrow({ where: { id: profile.id } });
  return {
    profile: updated,
    publicSnapshotUnchanged:
      JSON.stringify(still.publicSnapshot) === JSON.stringify(publicBefore),
  };
}

export function toPublicJobView(job: {
  id: string;
  status: string;
  kind?: string;
  attemptCount: number;
  maxAttempts: number;
  creditCostSnapshot: number;
  resultJson: unknown;
  resultConflict: boolean;
  safeErrorCode: string | null;
  safeErrorMessage: string | null;
  providerMode: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  profileDraftRevision: number;
}) {
  return {
    id: job.id,
    kind: job.kind ?? null,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    creditCostSnapshot: job.creditCostSnapshot,
    resultConflict: job.resultConflict,
    safeErrorCode: job.safeErrorCode,
    safeErrorMessage: job.safeErrorMessage,
    providerMode: job.providerMode,
    labeledStub: job.providerMode === "stub",
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    profileDraftRevision: job.profileDraftRevision,
    suggestions: job.status === "READY" ? job.resultJson : null,
  };
}

export { draftFromProfile };
