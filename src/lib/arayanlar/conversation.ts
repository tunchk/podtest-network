import type { DraftAnswers, ConversationTurn } from "@/lib/arayanlar/constants";
import { MAX_PREPARATION_QUESTIONS } from "@/lib/arayanlar/constants";

export type QuestionKey =
  | "targetRole"
  | "storyAndContribution"
  | "workPreferences"
  | "boundariesAndContact"
  | "openFollowUp";

const QUESTION_PROMPTS: Record<QuestionKey, string> = {
  targetRole:
    "Şu an hedeflediğin rol veya unvan nedir? Kısa yazman yeterli; emin değilsen “bilmiyorum” diyebilirsin.",
  storyAndContribution:
    "Konuşmaya değer, gerçek bir deneyim veya sorun neydi ve senin katkın neydi? Ezbere başarı hikâyesi uydurmana gerek yok; atlamak istersen söyle.",
  workPreferences:
    "İstediğin çalışma ortamı veya tercihlerin neler (uzak/hibrit, ekip boyutu, tempo vb.)?",
  boundariesAndContact:
    "Konuşulmasını istemediğin konular var mı? Ayrıca sunucuların kullanabileceği onaylı iletişim kanalın nedir (ör. platform mesajı, e-posta)?",
  openFollowUp:
    "Eklemek veya düzeltmek istediğin kısa bir not var mı? Yoksa “yok” yazman yeterli.",
};

function isFilled(value: string | undefined) {
  if (!value) return false;
  const t = value.trim().toLowerCase();
  return t.length > 0 && t !== "bilmiyorum" && t !== "atla" && t !== "yok" && t !== "-";
}

export function nextQuestionKey(answers: DraftAnswers, questionsAsked: number): QuestionKey | null {
  if (questionsAsked >= MAX_PREPARATION_QUESTIONS) return null;

  const plan: QuestionKey[] = [];
  if (!isFilled(answers.targetRole)) plan.push("targetRole");
  if (!isFilled(answers.storyTopic) || !isFilled(answers.contribution)) {
    plan.push("storyAndContribution");
  }
  if (!isFilled(answers.workPreferences)) plan.push("workPreferences");
  if (!isFilled(answers.excludedTopics) || !isFilled(answers.contactChannel)) {
    plan.push("boundariesAndContact");
  }
  if (plan.length === 0 && questionsAsked < MAX_PREPARATION_QUESTIONS) {
    plan.push("openFollowUp");
  }

  const askedKeys = new Set<QuestionKey>();
  // Prefer first missing field; openFollowUp only once at end.
  const next = plan[0] ?? null;
  if (!next) return null;
  if (askedKeys.has(next)) return null;
  return next;
}

export function promptForQuestion(key: QuestionKey) {
  return QUESTION_PROMPTS[key];
}

export function applyAnswerToDraft(
  answers: DraftAnswers,
  key: QuestionKey,
  raw: string,
  skipped: boolean,
): DraftAnswers {
  const text = skipped ? "" : raw.trim();
  const next = { ...answers };

  if (key === "targetRole") {
    next.targetRole = text || answers.targetRole;
  } else if (key === "storyAndContribution") {
    if (!skipped && text) {
      // Heuristic split: first sentence ~ story, rest ~ contribution if "ben/" markers.
      const parts = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        next.storyTopic = parts[0];
        next.contribution = parts.slice(1).join(" ");
      } else {
        next.storyTopic = text;
        if (!isFilled(next.contribution)) next.contribution = text;
      }
    }
  } else if (key === "workPreferences") {
    next.workPreferences = text || answers.workPreferences;
  } else if (key === "boundariesAndContact") {
    if (!skipped && text) {
      const lower = text.toLowerCase();
      if (lower.includes("iletişim") || lower.includes("email") || lower.includes("e-posta") || lower.includes("@")) {
        const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
        if (lines.length >= 2) {
          next.excludedTopics = lines[0];
          next.contactChannel = lines.slice(1).join(" ");
        } else {
          next.contactChannel = text;
          if (!isFilled(next.excludedTopics)) next.excludedTopics = "Belirtilmedi";
        }
      } else {
        next.excludedTopics = text;
        if (!isFilled(next.contactChannel)) next.contactChannel = "Platform üzerinden";
      }
    }
  } else if (key === "openFollowUp") {
    next.extraNotes = text || answers.extraNotes;
  }

  return next;
}

export function buildOpeningTurn(answers: DraftAnswers): ConversationTurn {
  const key = nextQuestionKey(answers, 0) ?? "targetRole";
  return {
    role: "assistant",
    content: `Merhaba. Bu kısa hazırlık en fazla beş soru sürer; mülakat veya prova değildir. Zaten bilinenleri atlarız. ${promptForQuestion(key)}`,
    at: new Date().toISOString(),
    questionKey: key,
  };
}

export function conversationComplete(answers: DraftAnswers, questionsAsked: number, useSummary: boolean) {
  if (useSummary) return true;
  if (questionsAsked >= MAX_PREPARATION_QUESTIONS) return true;
  return nextQuestionKey(answers, questionsAsked) === null;
}

export function seedAnswersFromProfile(profile: {
  displayName: string;
  headline: string | null;
  workPreferences: string | null;
  publicationStatus: string;
} | null): { answers: DraftAnswers; hints: string[] } {
  const answers: DraftAnswers = {};
  const hints: string[] = [];
  if (!profile) return { answers, hints };

  // Only reuse member-visible approved-ish fields as soft hints; never raw CV.
  if (profile.headline?.trim()) {
    answers.targetRole = profile.headline.trim();
    hints.push("headline→targetRole");
  }
  if (profile.workPreferences?.trim()) {
    answers.workPreferences = profile.workPreferences.trim();
    hints.push("workPreferences");
  }
  if (profile.displayName?.trim()) {
    hints.push("displayName");
  }
  return { answers, hints };
}
