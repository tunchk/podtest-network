import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  ARAYANLAR_PREPARE_CREDIT_COST,
  EDITORIAL_TEMPLATE_VERSION,
  HOST_PACK_REGEN_MAX,
  HOST_PACK_REGEN_WINDOW_MS,
  MAX_PREPARATION_QUESTIONS,
  type ConversationTurn,
  type DraftAnswers,
  type SubmittedFacts,
} from "@/lib/arayanlar/constants";
import {
  applyAnswerToDraft,
  buildOpeningTurn,
  conversationComplete,
  nextQuestionKey,
  promptForQuestion,
  seedAnswersFromProfile,
  type QuestionKey,
} from "@/lib/arayanlar/conversation";
import { proposeArayanlarFactsFromOwnedCv } from "@/lib/arayanlar/cv-proposals";
import { guestBriefSchema, hostPackSchema, type HostPack } from "@/lib/arayanlar/artifact-schema";
import { canHostAccessApplication, isAuthorizedHost } from "@/lib/arayanlar/host-auth";
import {
  assertArayanlarChatLimits,
  releaseArayanlarChatSlot,
} from "@/lib/arayanlar/rate-limit";
import {
  ensureSponsoredArayanlarPrepareGrant,
  getAvailableCreditBalanceForArayanlar,
  releaseJobReservation,
  reserveCreditsForJob,
} from "@/lib/credits/ledger";

function asDraftAnswers(value: unknown): DraftAnswers {
  if (!value || typeof value !== "object") return {};
  return value as DraftAnswers;
}

function asTurns(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value as ConversationTurn[];
}

export async function quoteArayanlarPrepare(userId: string) {
  // Do not auto-grant until cost is confirmed — show planned sponsorship amount.
  const available = await getAvailableCreditBalanceForArayanlar(userId);
  const grant = await prisma.creditLot.findUnique({
    where: { idempotencyKey: `sponsored:ai.arayanlar.prepare:v1:${userId}` },
  });
  return {
    cost: ARAYANLAR_PREPARE_CREDIT_COST,
    sponsoredAmount: Number(process.env.SPONSORED_ARAYANLAR_PREPARE_AMOUNT ?? "1"),
    grantAlreadyIssued: Boolean(grant),
    available,
    canAffordAfterGrant:
      available + (grant ? 0 : Number(process.env.SPONSORED_ARAYANLAR_PREPARE_AMOUNT ?? "1")) >=
      ARAYANLAR_PREPARE_CREDIT_COST,
    currencyLabel: "AI kredisi",
    note:
      "Kısa sohbet ve iki hazırlık çıktısı tek seferlik sponsorlu akıştır; mesaj başına ücret yok.",
  };
}

export async function getOrCreateApplication(userId: string) {
  const existing = await prisma.arayanlarApplication.findUnique({ where: { userId } });
  if (existing) return existing;

  const profile = await prisma.profile.findUnique({ where: { userId } });
  const seeded = seedAnswersFromProfile(profile);
  const opening = buildOpeningTurn(seeded.answers);

  return prisma.arayanlarApplication.create({
    data: {
      userId,
      status: "DRAFT",
      prepStatus: "NOT_STARTED",
      draftAnswers: seeded.answers as Prisma.InputJsonValue,
      conversationTurns: [opening] as unknown as Prisma.InputJsonValue,
      questionsAsked: 0,
      editorialTemplateVersion: EDITORIAL_TEMPLATE_VERSION,
    },
  });
}

/**
 * Confirm sponsorship visibility and issue idempotent grant. Reservation begins only on submit.
 */
export async function confirmCostAndStart(userId: string) {
  const app = await getOrCreateApplication(userId);
  if (app.status === "WITHDRAWN") {
    return reopenWithdrawnAsDraft(userId);
  }
  if (app.status === "SUBMITTED" && app.prepStatus === "READY") {
    return app;
  }

  await ensureSponsoredArayanlarPrepareGrant(userId);

  return prisma.arayanlarApplication.update({
    where: { id: app.id },
    data: { confirmedCostAt: app.confirmedCostAt ?? new Date() },
  });
}

async function reopenWithdrawnAsDraft(userId: string) {
  const app = await prisma.arayanlarApplication.findUniqueOrThrow({ where: { userId } });
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const seeded = seedAnswersFromProfile(profile);
  const opening = buildOpeningTurn(seeded.answers);

  await ensureSponsoredArayanlarPrepareGrant(userId);

  return prisma.arayanlarApplication.update({
    where: { id: app.id },
    data: {
      status: "DRAFT",
      prepStatus: "NOT_STARTED",
      draftAnswers: seeded.answers as Prisma.InputJsonValue,
      conversationTurns: [opening] as unknown as Prisma.InputJsonValue,
      questionsAsked: 0,
      useSummaryFallback: false,
      submittedFacts: Prisma.DbNull,
      // Keep submittedRevision counter; new submit increments.
      submittedAt: null,
      withdrawnAt: null,
      confirmedCostAt: new Date(),
      prepareJobId: null,
      assignedHostUserId: null,
      assignedAt: null,
      assignedByUserId: null,
      editorialTemplateVersion: EDITORIAL_TEMPLATE_VERSION,
    },
  });
}

export async function postConversationMessage(options: {
  userId: string;
  message: string;
  skip?: boolean;
}) {
  const app = await getOrCreateApplication(options.userId);
  if (app.status === "WITHDRAWN") throw new Error("WITHDRAWN");
  if (app.status === "SUBMITTED") throw new Error("ALREADY_SUBMITTED");

  // Do not reset questionsAsked on resume — budget is durable on the application row.
  if (app.questionsAsked >= MAX_PREPARATION_QUESTIONS && !options.skip) {
    // Still allow reading state; further questions are blocked by planner.
  }

  assertArayanlarChatLimits(options.userId, options.skip ? 0 : options.message.length);
  try {
    let answers = asDraftAnswers(app.draftAnswers);
    let turns = asTurns(app.conversationTurns);
    let questionsAsked = app.questionsAsked;

    const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant");
    const key = (lastAssistant?.questionKey as QuestionKey | undefined) ?? nextQuestionKey(answers, questionsAsked);

    if (!key) {
      return finalizeAwaitingConfirmation(app.id, answers, turns, questionsAsked);
    }

    const memberText = options.skip ? "Atladım" : options.message.trim();
    turns = [
      ...turns,
      {
        role: "member",
        content: memberText,
        at: new Date().toISOString(),
        questionKey: key,
        skipped: Boolean(options.skip),
      },
    ];

    answers = applyAnswerToDraft(answers, key, memberText, Boolean(options.skip));
    questionsAsked += 1;

    const nextKey = nextQuestionKey(answers, questionsAsked);
    if (!nextKey || conversationComplete(answers, questionsAsked, false)) {
      turns = [
        ...turns,
        {
          role: "assistant",
          content:
            "Teşekkürler. Kısa sorular tamam. Göndermeden önce paylaşılacak gerçekleri kontrol edebilirsin.",
          at: new Date().toISOString(),
        },
      ];
      return finalizeAwaitingConfirmation(app.id, answers, turns, questionsAsked);
    }

    turns = [
      ...turns,
      {
        role: "assistant",
        content: promptForQuestion(nextKey),
        at: new Date().toISOString(),
        questionKey: nextKey,
      },
    ];

    return prisma.arayanlarApplication.update({
      where: { id: app.id },
      data: {
        status: "DRAFT",
        draftAnswers: answers as Prisma.InputJsonValue,
        conversationTurns: turns as unknown as Prisma.InputJsonValue,
        questionsAsked,
      },
    });
  } finally {
    releaseArayanlarChatSlot(options.userId);
  }
}

async function finalizeAwaitingConfirmation(
  applicationId: string,
  answers: DraftAnswers,
  turns: ConversationTurn[],
  questionsAsked: number,
) {
  return prisma.arayanlarApplication.update({
    where: { id: applicationId },
    data: {
      status: "AWAITING_CONFIRMATION",
      draftAnswers: answers as Prisma.InputJsonValue,
      conversationTurns: turns as unknown as Prisma.InputJsonValue,
      questionsAsked,
    },
  });
}

export async function switchToSummaryFallback(userId: string, answersPatch: DraftAnswers) {
  const app = await getOrCreateApplication(userId);
  if (app.status === "WITHDRAWN" || app.status === "SUBMITTED") {
    throw new Error("INVALID_STATE");
  }
  const merged = { ...asDraftAnswers(app.draftAnswers), ...answersPatch };
  return prisma.arayanlarApplication.update({
    where: { id: app.id },
    data: {
      useSummaryFallback: true,
      status: "AWAITING_CONFIRMATION",
      draftAnswers: merged as Prisma.InputJsonValue,
    },
  });
}

/**
 * Explicit opt-in: fill editable Arayanlar proposals from an owned private CV.
 * No AI credit charge. Raw CV text is never stored on the application or artifacts.
 * Cost confirmation is ensured here so the entry works without a prior "Tanışmaya başla".
 */
export async function applyOwnedCvProposalsToApplication(
  userId: string,
  cvDocumentId: string,
) {
  await confirmCostAndStart(userId);
  const app = await prisma.arayanlarApplication.findUnique({ where: { userId } });
  if (!app) throw new Error("NOT_FOUND");
  if (app.status === "WITHDRAWN" || app.status === "SUBMITTED") {
    throw new Error("INVALID_STATE");
  }

  const proposal = await proposeArayanlarFactsFromOwnedCv(userId, cvDocumentId);
  const prior = asDraftAnswers(app.draftAnswers);
  const merged: DraftAnswers = {
    ...prior,
    ...proposal.answers,
    // Keep member-entered contact/exclusions if already set.
    excludedTopics: prior.excludedTopics?.trim()
      ? prior.excludedTopics
      : proposal.answers.excludedTopics,
    contactChannel: prior.contactChannel?.trim()
      ? prior.contactChannel
      : proposal.answers.contactChannel,
    sourceHints: [
      ...new Set([...(prior.sourceHints ?? []), ...proposal.hints]),
    ],
  };

  const turns = [
    ...asTurns(app.conversationTurns),
    {
      role: "assistant" as const,
      content:
        "Mevcut CV’nden düzenlenebilir öneriler dolduruldu. Onaylamadan önce kontrol et; ham CV metni sunucuya veya konuk brifine eklenmez.",
      at: new Date().toISOString(),
    },
  ];

  const updated = await prisma.arayanlarApplication.update({
    where: { id: app.id },
    data: {
      useSummaryFallback: true,
      status: "AWAITING_CONFIRMATION",
      draftAnswers: merged as Prisma.InputJsonValue,
      conversationTurns: turns as unknown as Prisma.InputJsonValue,
      confirmedCostAt: app.confirmedCostAt ?? new Date(),
    },
  });

  return { application: updated, proposal };
}

export function buildFactsPreview(options: {
  displayName: string;
  answers: DraftAnswers;
  profileHints: string[];
}): SubmittedFacts {
  const sourceHints = options.answers.sourceHints ?? [];
  return {
    displayName: options.displayName,
    targetRole: options.answers.targetRole?.trim() || "",
    storyTopic: options.answers.storyTopic?.trim() || "",
    contribution: options.answers.contribution?.trim() || "",
    workPreferences: options.answers.workPreferences?.trim() || "",
    excludedTopics: options.answers.excludedTopics?.trim() || "",
    contactChannel: options.answers.contactChannel?.trim() || "",
    profileHintsUsed: [...new Set([...options.profileHints, ...sourceHints])],
    memberNotes: options.answers.extraNotes?.trim() || undefined,
  };
}

/**
 * Explicit submission: immutable revision + credit reservation + ARAYANLAR_PREPARE job.
 * Reservation begins here; settles when both artifacts persist atomically.
 */
export async function submitApplication(options: {
  userId: string;
  facts: SubmittedFacts;
}) {
  const app = await prisma.arayanlarApplication.findUnique({ where: { userId: options.userId } });
  if (!app) throw new Error("NOT_FOUND");
  if (app.status === "WITHDRAWN") throw new Error("WITHDRAWN");
  if (app.status === "SUBMITTED" && (app.prepStatus === "QUEUED" || app.prepStatus === "RUNNING" || app.prepStatus === "READY")) {
    throw new Error("ALREADY_SUBMITTED");
  }

  // Host prep is derived from submission; require explicit host-prep sharing notice.
  const { requireHostPrepSharingGate } = await import("@/lib/legal/service");
  await requireHostPrepSharingGate(options.userId, app.id);

  if (!app.confirmedCostAt) {
    await ensureSponsoredArayanlarPrepareGrant(options.userId);
  } else {
    await ensureSponsoredArayanlarPrepareGrant(options.userId);
  }

  const nextRevision = app.submittedRevision + 1;
  const jobId = randomUUID().replace(/-/g, "").slice(0, 24);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.arayanlarApplication.update({
        where: { id: app.id },
        data: {
          status: "SUBMITTED",
          prepStatus: "QUEUED",
          submittedFacts: options.facts as unknown as Prisma.InputJsonValue,
          submittedRevision: nextRevision,
          submittedAt: new Date(),
          confirmedCostAt: app.confirmedCostAt ?? new Date(),
          editorialTemplateVersion: EDITORIAL_TEMPLATE_VERSION,
          prepareJobId: jobId,
          withdrawnAt: null,
        },
      });

      const job = await tx.aiJob.create({
        data: {
          id: jobId,
          userId: options.userId,
          profileId: null,
          kind: "ARAYANLAR_PREPARE",
          status: "QUEUED",
          creditCostSnapshot: ARAYANLAR_PREPARE_CREDIT_COST,
          profileDraftRevision: nextRevision,
          arayanlarApplicationId: app.id,
          maxAttempts: 3,
        },
      });

      const reservation = await reserveCreditsForJob({
        userId: options.userId,
        jobId: job.id,
        amount: ARAYANLAR_PREPARE_CREDIT_COST,
        tx,
      });

      await tx.aiJob.update({
        where: { id: job.id },
        data: { reservationEntryId: reservation.id },
      });

      return { application: updated, jobId: job.id };
    });

    return result;
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") {
      await prisma.arayanlarApplication.update({
        where: { id: app.id },
        data: {
          status: "AWAITING_CONFIRMATION",
          prepStatus: "NOT_STARTED",
          prepareJobId: null,
        },
      });
    }
    throw error;
  }
}

/**
 * Later edits create a new draft without rewriting the submitted revision or packs.
 */
export async function startRevisionDraft(userId: string) {
  const app = await prisma.arayanlarApplication.findUnique({ where: { userId } });
  if (!app) throw new Error("NOT_FOUND");
  if (app.status !== "SUBMITTED") throw new Error("INVALID_STATE");

  // Cancel in-flight job if any
  if (app.prepareJobId && (app.prepStatus === "QUEUED" || app.prepStatus === "RUNNING")) {
    await prisma.aiJob.updateMany({
      where: { id: app.prepareJobId, status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        finishedAt: new Date(),
        safeErrorCode: "superseded",
        safeErrorMessage: "Yeni taslak için önceki iş iptal edildi.",
      },
    });
    await releaseJobReservation(app.prepareJobId);
  }

  const answers = asDraftAnswers(app.draftAnswers);
  return prisma.arayanlarApplication.update({
    where: { id: app.id },
    data: {
      status: "DRAFT",
      prepStatus: "NOT_STARTED",
      // Keep last submittedFacts/revision for host access to prior pack until new submit.
      prepareJobId: null,
      conversationTurns: [
        {
          role: "assistant",
          content:
            "Önceki gönderimin duruyor; bu yeni bir taslak. Değişiklikler yeni bir gönderim ve yeni hazırlık paketi gerektirir.",
          at: new Date().toISOString(),
        },
        buildOpeningTurn(answers),
      ] as unknown as Prisma.InputJsonValue,
      questionsAsked: 0,
    },
  });
}

export async function withdrawApplication(userId: string) {
  const app = await prisma.arayanlarApplication.findUnique({ where: { userId } });
  if (!app) throw new Error("NOT_FOUND");
  if (app.status === "WITHDRAWN") return app;

  if (app.prepareJobId) {
    await prisma.aiJob.updateMany({
      where: { id: app.prepareJobId, status: { in: ["QUEUED", "RUNNING"] } },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        finishedAt: new Date(),
        safeErrorCode: "withdrawn",
        safeErrorMessage: "Başvuru geri çekildi.",
      },
    });
    await releaseJobReservation(app.prepareJobId);
  }

  return prisma.arayanlarApplication.update({
    where: { id: app.id },
    data: {
      status: "WITHDRAWN",
      prepStatus: app.prepStatus === "READY" ? "CANCELLED" : "CANCELLED",
      withdrawnAt: new Date(),
      assignedHostUserId: null,
      assignedAt: null,
      assignedByUserId: null,
    },
  });
}

export async function assignHost(options: {
  applicationId: string;
  hostUserId: string;
  assignedByUserId: string;
}) {
  if (!(await isAuthorizedHost(options.hostUserId))) {
    throw new Error("HOST_NOT_AUTHORIZED");
  }
  const app = await prisma.arayanlarApplication.findUnique({
    where: { id: options.applicationId },
  });
  if (!app) throw new Error("NOT_FOUND");
  if (app.status === "WITHDRAWN") throw new Error("WITHDRAWN");

  return prisma.arayanlarApplication.update({
    where: { id: options.applicationId },
    data: {
      assignedHostUserId: options.hostUserId,
      assignedAt: new Date(),
      assignedByUserId: options.assignedByUserId,
    },
  });
}

/** Guest-safe view: never includes host pack fields. */
export function toGuestApplicationView(app: {
  id: string;
  status: string;
  prepStatus: string;
  draftAnswers: unknown;
  conversationTurns: unknown;
  questionsAsked: number;
  useSummaryFallback: boolean;
  submittedFacts: unknown;
  submittedRevision: number;
  submittedAt: Date | null;
  confirmedCostAt: Date | null;
  editorialTemplateVersion: string;
  withdrawnAt: Date | null;
  prepareJobId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: app.id,
    status: app.status,
    prepStatus: app.prepStatus,
    draftAnswers: app.draftAnswers,
    conversationTurns: app.conversationTurns,
    questionsAsked: app.questionsAsked,
    useSummaryFallback: app.useSummaryFallback,
    submittedFacts: app.submittedFacts,
    submittedRevision: app.submittedRevision,
    submittedAt: app.submittedAt,
    confirmedCostAt: app.confirmedCostAt,
    editorialTemplateVersion: app.editorialTemplateVersion,
    withdrawnAt: app.withdrawnAt,
    prepareJobId: app.prepareJobId,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export async function getGuestBriefForMember(userId: string) {
  const app = await prisma.arayanlarApplication.findUnique({ where: { userId } });
  if (!app || app.status === "WITHDRAWN") return null;
  if (app.prepStatus !== "READY" || app.submittedRevision < 1) return null;

  const artifact = await prisma.arayanlarArtifact.findUnique({
    where: {
      applicationId_kind_submittedRevision: {
        applicationId: app.id,
        kind: "GUEST_BRIEF",
        submittedRevision: app.submittedRevision,
      },
    },
  });
  if (!artifact) return null;
  const parsed = guestBriefSchema.safeParse(artifact.generatedJson);
  if (!parsed.success) return null;
  return {
    applicationId: app.id,
    submittedRevision: artifact.submittedRevision,
    editorialTemplateVersion: artifact.editorialTemplateVersion,
    brief: parsed.data,
  };
}

export async function getHostPackForAssignedHost(options: {
  hostUserId: string;
  applicationId: string;
}) {
  const access = await canHostAccessApplication(options);
  if (!access.ok) return { ok: false as const, reason: access.reason };

  const app = access.application;
  if (app.prepStatus !== "READY" || !app.submittedFacts) {
    return { ok: false as const, reason: "not_ready" };
  }

  const artifact = await prisma.arayanlarArtifact.findUnique({
    where: {
      applicationId_kind_submittedRevision: {
        applicationId: app.id,
        kind: "HOST_PACK",
        submittedRevision: app.submittedRevision,
      },
    },
  });
  if (!artifact) return { ok: false as const, reason: "missing_artifact" };

  const generated = hostPackSchema.safeParse(artifact.generatedJson);
  if (!generated.success) return { ok: false as const, reason: "invalid_artifact" };

  const edited = artifact.hostEditedJson
    ? hostPackSchema.safeParse(artifact.hostEditedJson)
    : null;

  return {
    ok: true as const,
    application: {
      id: app.id,
      submittedRevision: app.submittedRevision,
      submittedAt: app.submittedAt,
      editorialTemplateVersion: app.editorialTemplateVersion,
      submittedFacts: app.submittedFacts,
      prepStatus: app.prepStatus,
    },
    generated: generated.data,
    effective: (edited?.success ? edited.data : generated.data) as HostPack,
    hasHostEdits: Boolean(edited?.success),
  };
}

export async function saveHostPackEdits(options: {
  hostUserId: string;
  applicationId: string;
  edits: HostPack;
}) {
  const access = await canHostAccessApplication(options);
  if (!access.ok) throw new Error(access.reason);

  const parsed = hostPackSchema.safeParse(options.edits);
  if (!parsed.success) throw new Error("INVALID_PACK");

  const app = access.application;
  const artifact = await prisma.arayanlarArtifact.findUnique({
    where: {
      applicationId_kind_submittedRevision: {
        applicationId: app.id,
        kind: "HOST_PACK",
        submittedRevision: app.submittedRevision,
      },
    },
  });
  if (!artifact) throw new Error("NOT_FOUND");

  return prisma.arayanlarArtifact.update({
    where: { id: artifact.id },
    data: { hostEditedJson: parsed.data as unknown as Prisma.InputJsonValue },
  });
}

/**
 * Host regeneration uses platform allocation (rate-limited). Never consumes guest credits.
 * Stores a new generatedJson for the same revision but preserves hostEditedJson.
 */
export async function requestHostPackRegeneration(options: {
  hostUserId: string;
  applicationId: string;
}) {
  const access = await canHostAccessApplication(options);
  if (!access.ok) throw new Error(access.reason);

  const since = new Date(Date.now() - HOST_PACK_REGEN_WINDOW_MS);
  const recent = await prisma.aiJob.count({
    where: {
      arayanlarApplicationId: options.applicationId,
      kind: "ARAYANLAR_PREPARE",
      createdAt: { gte: since },
      // platform regen jobs marked via providerMode prefix in result — count jobs with zero credit
      creditCostSnapshot: 0,
    },
  });
  if (recent >= HOST_PACK_REGEN_MAX) {
    throw new Error("RATE_LIMITED");
  }

  const app = access.application;
  if (app.prepStatus !== "READY" || !app.submittedFacts) {
    throw new Error("NOT_READY");
  }

  const jobId = randomUUID().replace(/-/g, "").slice(0, 24);
  const job = await prisma.aiJob.create({
    data: {
      id: jobId,
      userId: options.hostUserId,
      kind: "ARAYANLAR_PREPARE",
      status: "QUEUED",
      creditCostSnapshot: 0,
      profileDraftRevision: app.submittedRevision,
      arayanlarApplicationId: app.id,
      maxAttempts: 2,
      providerMode: "platform_host_regen",
    },
  });

  return job;
}

export async function listApplicationsForHost(hostUserId: string) {
  if (!(await isAuthorizedHost(hostUserId))) return [];
  return prisma.arayanlarApplication.findMany({
    where: {
      assignedHostUserId: hostUserId,
      status: { not: "WITHDRAWN" },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      prepStatus: true,
      submittedRevision: true,
      submittedAt: true,
      editorialTemplateVersion: true,
      updatedAt: true,
      user: { select: { name: true, email: true } },
    },
  });
}

export async function listApplicationsForAdmin() {
  return prisma.arayanlarApplication.findMany({
    where: { status: { not: "WITHDRAWN" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      prepStatus: true,
      submittedRevision: true,
      submittedAt: true,
      assignedHostUserId: true,
      user: { select: { id: true, name: true, email: true } },
      assignedHost: { select: { id: true, name: true, email: true } },
    },
  });
}
