import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type {
  LegalAcceptanceType,
  LegalDocumentType,
  Prisma,
} from "@/generated/prisma/client";
import {
  CURRENT_LEGAL_DOCUMENTS,
  SUBPROCESSOR_CATALOG,
  documentKey,
  type LegalDocDefinition,
} from "@/lib/legal/documents";

let ensurePromise: Promise<void> | null = null;

/** Upsert current draft documents into DB (idempotent). */
export async function ensureLegalDocumentsSeeded() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      for (const doc of CURRENT_LEGAL_DOCUMENTS) {
        await prisma.legalDocument.upsert({
          where: {
            type_version_locale: {
              type: doc.type,
              version: doc.version,
              locale: doc.locale,
            },
          },
          create: {
            type: doc.type,
            version: doc.version,
            locale: doc.locale,
            title: doc.title,
            summary: doc.summary,
            bodyMarkdown: doc.bodyMarkdown,
            requiresReacceptance: doc.requiresReacceptance,
          },
          update: {
            title: doc.title,
            summary: doc.summary,
            bodyMarkdown: doc.bodyMarkdown,
            requiresReacceptance: doc.requiresReacceptance,
          },
        });
      }
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
}

export function getDocumentDefinition(type: LegalDocumentType): LegalDocDefinition {
  const doc = CURRENT_LEGAL_DOCUMENTS.find((d) => d.type === type);
  if (!doc) throw new Error(`Unknown legal document type: ${type}`);
  return doc;
}

export async function getCurrentDocument(type: LegalDocumentType, locale = "tr") {
  await ensureLegalDocumentsSeeded();
  const def = getDocumentDefinition(type);
  return prisma.legalDocument.findUniqueOrThrow({
    where: {
      type_version_locale: { type, version: def.version, locale },
    },
  });
}

export type RecordAcceptanceInput = {
  userId: string;
  type: LegalAcceptanceType;
  documentType: LegalDocumentType;
  scope?: string | null;
  relatedResourceType?: string | null;
  relatedResourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function recordAcceptance(input: RecordAcceptanceInput) {
  const doc = await getCurrentDocument(input.documentType);
  const def = getDocumentDefinition(input.documentType);
  if (def.acceptanceType !== input.type) {
    throw new Error("ACCEPTANCE_TYPE_MISMATCH");
  }

  return prisma.legalAcceptance.create({
    data: {
      userId: input.userId,
      type: input.type,
      documentType: input.documentType,
      documentVersion: doc.version,
      documentKey: documentKey(doc.type, doc.version, doc.locale),
      scope: input.scope ?? null,
      relatedResourceType: input.relatedResourceType ?? null,
      relatedResourceId: input.relatedResourceId ?? null,
      metadata: input.metadata,
    },
  });
}

export async function hasCurrentAcceptance(options: {
  userId: string;
  type: LegalAcceptanceType;
  documentType: LegalDocumentType;
  relatedResourceType?: string | null;
  relatedResourceId?: string | null;
  /** When set, metadata.publicationVersionId must match. */
  publicationVersionId?: string | null;
}) {
  const doc = getDocumentDefinition(options.documentType);
  const rows = await prisma.legalAcceptance.findMany({
    where: {
      userId: options.userId,
      type: options.type,
      documentKey: documentKey(doc.type, doc.version, doc.locale),
      withdrawnAt: null,
      ...(options.relatedResourceType
        ? { relatedResourceType: options.relatedResourceType }
        : {}),
      ...(options.relatedResourceId ? { relatedResourceId: options.relatedResourceId } : {}),
    },
    orderBy: { acceptedAt: "desc" },
    take: 5,
  });

  if (!rows.length) return false;
  if (!options.publicationVersionId) return true;
  return rows.some((row) => {
    const meta = row.metadata as { publicationVersionId?: string } | null;
    return meta?.publicationVersionId === options.publicationVersionId;
  });
}

export async function withdrawAcceptance(options: {
  userId: string;
  acceptanceId: string;
}) {
  const row = await prisma.legalAcceptance.findFirst({
    where: { id: options.acceptanceId, userId: options.userId },
  });
  if (!row) throw new Error("NOT_FOUND");
  if (row.withdrawnAt) return row;
  return prisma.legalAcceptance.update({
    where: { id: row.id },
    data: { withdrawnAt: new Date() },
  });
}

export async function listAcceptancesForUser(userId: string) {
  return prisma.legalAcceptance.findMany({
    where: { userId },
    orderBy: { acceptedAt: "desc" },
  });
}

export async function requireAccountLegalGate(userId: string) {
  const terms = await hasCurrentAcceptance({
    userId,
    type: "TERMS",
    documentType: "TERMS_OF_SERVICE",
  });
  const privacy = await hasCurrentAcceptance({
    userId,
    type: "PRIVACY_NOTICE",
    documentType: "PRIVACY_NOTICE",
  });
  if (!terms || !privacy) {
    const err = new Error("LEGAL_ACCOUNT_REQUIRED");
    (err as Error & { code: string }).code = "LEGAL_ACCOUNT_REQUIRED";
    throw err;
  }
}

export async function requireCvAiProcessingGate(options: {
  userId: string;
  cvDocumentId: string;
  requireConsent: boolean;
}) {
  const notice = await hasCurrentAcceptance({
    userId: options.userId,
    type: "CV_AI_PROCESSING",
    documentType: "CV_AI_PROCESSING_NOTICE",
    relatedResourceType: "cv_document",
    relatedResourceId: options.cvDocumentId,
  });
  // Also accept account-scoped CV notice (upload-time) covering later AI use of same CV.
  const noticeAny =
    notice ||
    (await hasCurrentAcceptance({
      userId: options.userId,
      type: "CV_AI_PROCESSING",
      documentType: "CV_AI_PROCESSING_NOTICE",
    }));
  if (!noticeAny) {
    const err = new Error("LEGAL_CV_NOTICE_REQUIRED");
    (err as Error & { code: string }).code = "LEGAL_CV_NOTICE_REQUIRED";
    throw err;
  }
  if (options.requireConsent) {
    const consent =
      (await hasCurrentAcceptance({
        userId: options.userId,
        type: "CV_AI_CONSENT",
        documentType: "CV_AI_CONSENT",
        relatedResourceType: "cv_document",
        relatedResourceId: options.cvDocumentId,
      })) ||
      (await hasCurrentAcceptance({
        userId: options.userId,
        type: "CV_AI_CONSENT",
        documentType: "CV_AI_CONSENT",
      }));
    if (!consent) {
      const err = new Error("LEGAL_CV_CONSENT_REQUIRED");
      (err as Error & { code: string }).code = "LEGAL_CV_CONSENT_REQUIRED";
      throw err;
    }
  }
}

export async function requireHostPrepSharingGate(userId: string, applicationId: string) {
  const ok = await hasCurrentAcceptance({
    userId,
    type: "HOST_PREP_SHARING",
    documentType: "HOST_PREP_SHARING_NOTICE",
    relatedResourceType: "arayanlar_application",
    relatedResourceId: applicationId,
  });
  if (!ok) {
    const err = new Error("LEGAL_HOST_PREP_REQUIRED");
    (err as Error & { code: string }).code = "LEGAL_HOST_PREP_REQUIRED";
    throw err;
  }
}

export async function requireRecordingConsent(options: {
  userId: string;
  relatedResourceType: string;
  relatedResourceId: string;
}) {
  const ok = await hasCurrentAcceptance({
    userId: options.userId,
    type: "RECORDING",
    documentType: "RECORDING_CONSENT",
    relatedResourceType: options.relatedResourceType,
    relatedResourceId: options.relatedResourceId,
  });
  if (!ok) {
    const err = new Error("LEGAL_RECORDING_REQUIRED");
    (err as Error & { code: string }).code = "LEGAL_RECORDING_REQUIRED";
    throw err;
  }
}

export function computeEpisodePublicationVersionId(episode: {
  id: string;
  title: string;
  description: string | null;
  audioUrl: string | null;
  listeningUrl: string | null;
  spotifyEpisodeUrl: string | null;
  artworkUrl?: string | null;
  publicationDate: Date | null;
}) {
  const payload = JSON.stringify({
    id: episode.id,
    title: episode.title,
    description: episode.description,
    audioUrl: episode.audioUrl,
    listeningUrl: episode.listeningUrl,
    spotifyEpisodeUrl: episode.spotifyEpisodeUrl,
    artworkUrl: episode.artworkUrl ?? null,
    publicationDate: episode.publicationDate?.toISOString() ?? null,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export async function requirePublicationApproval(options: {
  userId: string;
  episodeId: string;
  publicationVersionId: string;
}) {
  const ok = await hasCurrentAcceptance({
    userId: options.userId,
    type: "PUBLICATION",
    documentType: "PUBLICATION_APPROVAL",
    relatedResourceType: "podcast_episode",
    relatedResourceId: options.episodeId,
    publicationVersionId: options.publicationVersionId,
  });
  if (!ok) {
    const err = new Error("LEGAL_PUBLICATION_REQUIRED");
    (err as Error & { code: string }).code = "LEGAL_PUBLICATION_REQUIRED";
    throw err;
  }
}

export async function hasMarketingOptIn(userId: string) {
  return hasCurrentAcceptance({
    userId,
    type: "MARKETING",
    documentType: "MARKETING_CONSENT",
  });
}

export function listConfiguredSubprocessors() {
  return SUBPROCESSOR_CATALOG.map((entry) => {
    const configured = entry.configuredHintEnv.some((name) => {
      const v = process.env[name];
      return Boolean(v && v.trim());
    });
    return {
      key: entry.key,
      purpose: entry.purpose,
      dataCategories: entry.dataCategories,
      classification: entry.classification,
      configured,
      ...(entry.deploymentPlaceholder
        ? { deploymentPlaceholder: entry.deploymentPlaceholder }
        : {}),
      // Never expose secret values — only whether the integration appears configured.
    };
  });
}

export { LEGAL_COPY } from "@/lib/legal/copy";

