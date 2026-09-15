import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { ProfileDraftFields } from "@/lib/profiles/types";
import type { AutomatedReviewOutcome, Prisma } from "@/generated/prisma/client";

export const AUTOMATED_MODERATION_POLICY_VERSION = "m2.1-rule-based-v1";

/** Active adapter identity — rule-based heuristics only in M2.1 (not an OpenAI integration). */
export const AUTOMATED_MODERATION_ADAPTER = "rule-based-heuristic";

const VIOLATION_PATTERNS: Array<{ code: string; re: RegExp }> = [
  { code: "threat", re: /\b(öldür|öldüreceğim|threaten to kill|bombayı)\b/i },
  { code: "hate", re: /\b(ırkçı|soykırım|hepsini yok edelim)\b/i },
  { code: "doxxing", re: /\b(tc kimlik|sosyal güvenlik no|credit card\s*\d{4})\b/i },
  { code: "spam", re: /(buy now!!!|crypto airdrop|whatsapp\s*\+?\d{8,})/i },
];

function snapshotText(snapshot: ProfileDraftFields): string {
  return [
    snapshot.displayName,
    snapshot.headline,
    snapshot.bio,
    snapshot.skills?.join(" "),
    snapshot.interests?.join(" "),
    typeof snapshot.experience === "string" ? snapshot.experience : "",
    typeof snapshot.education === "string" ? snapshot.education : "",
    typeof snapshot.projects === "string" ? snapshot.projects : "",
    snapshot.workPreferences,
  ]
    .filter(Boolean)
    .join("\n");
}

function heuristicReview(text: string): {
  outcome: AutomatedReviewOutcome;
  reasonCodes: string[];
  summary: string;
} {
  const codes: string[] = [];
  for (const rule of VIOLATION_PATTERNS) {
    if (rule.re.test(text)) codes.push(rule.code);
  }

  // Informal language / professional criticism alone is not a violation.
  if (codes.length === 0) {
    return {
      outcome: "CLEAR",
      reasonCodes: [],
      summary:
        "Kural tabanlı yardımcı tarama belirgin ihlal bulmadı. Bu güvenli onay değildir; insan onayı hâlâ zorunludur.",
    };
  }

  if (codes.includes("threat") || codes.includes("hate") || codes.includes("doxxing")) {
    return {
      outcome: "LIKELY_VIOLATION",
      reasonCodes: codes,
      summary: `Kural tabanlı tarama olası ihlal işaretledi: ${codes.join(", ")}. İnsan incelemesi zorunlu; otomatik onay yok.`,
    };
  }

  return {
    outcome: "NEEDS_REVIEW",
    reasonCodes: codes,
    summary: `Kural tabanlı tarama inceleme önerir: ${codes.join(", ")}. İnsan onayı hâlâ zorunludur.`,
  };
}

/**
 * Assistive publication review. Never approves or publishes.
 * M2.1 adapter is rule-based heuristics only — not a live OpenAI moderation product.
 * Does not charge member credits. Does not read private CV files.
 * Revision-bound: results are stored against the submitted snapshot hash/revision.
 */
export async function runAutomatedPublicationReview(publicationReviewId: string) {
  const review = await prisma.publicationReview.findUnique({
    where: { id: publicationReviewId },
  });
  if (!review) return null;

  const existing = await prisma.automatedContentReview.findUnique({
    where: { publicationReviewId },
  });
  if (existing) return existing;

  const snapshot = review.submittedSnapshot as ProfileDraftFields;
  const text = snapshotText(snapshot);
  const snapshotHash =
    review.snapshotHash ||
    createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

  let outcome: AutomatedReviewOutcome = "UNAVAILABLE";
  let reasonCodes: string[] = [];
  let summary =
    "Kural tabanlı otomatik inceleme çalıştırılamadı. Kullanılamayan tarama güvenli sayılmaz; insan incelemesi zorunludur.";
  let providerMode = AUTOMATED_MODERATION_ADAPTER;

  try {
    const heuristic = heuristicReview(text);
    outcome = heuristic.outcome;
    reasonCodes = heuristic.reasonCodes;
    summary = heuristic.summary;
    providerMode = AUTOMATED_MODERATION_ADAPTER;
  } catch {
    outcome = "UNAVAILABLE";
    reasonCodes = [];
    summary =
      "Kural tabanlı otomatik inceleme başarısız. Kullanılamayan tarama güvenli sayılmaz; insan incelemesi zorunludur.";
    providerMode = "rule-based-unavailable";
  }

  return prisma.automatedContentReview.create({
    data: {
      publicationReviewId: review.id,
      profileId: review.profileId,
      reviewedDraftRevision: review.submittedDraftRevision,
      snapshotHash,
      policyVersion: AUTOMATED_MODERATION_POLICY_VERSION,
      outcome,
      reasonCodes,
      summaryForAdmin: summary,
      providerMode,
    },
  });
}

export async function getAutomatedReviewForAdmin(publicationReviewId: string) {
  return prisma.automatedContentReview.findUnique({
    where: { publicationReviewId },
  });
}

/** Ensure a stale automated review cannot green-light a different snapshot. */
export function automatedReviewMatches(
  review: { snapshotHash: string; submittedDraftRevision: number },
  automated: { snapshotHash: string; reviewedDraftRevision: number } | null,
) {
  if (!automated) return false;
  return (
    automated.snapshotHash === review.snapshotHash &&
    automated.reviewedDraftRevision === review.submittedDraftRevision
  );
}

export type { Prisma };
