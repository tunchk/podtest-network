/** Editorial contract version bound to submitted revisions and artifacts. */
export const EDITORIAL_TEMPLATE_VERSION = "kariyer-portresi-producer-v1";

export const MAX_PREPARATION_QUESTIONS = 5;

export const ARAYANLAR_PREPARE_CREDIT_COST = Number(
  process.env.ARAYANLAR_PREPARE_CREDIT_COST ?? "1",
);

export const SPONSORED_ARAYANLAR_PREPARE_AMOUNT = Number(
  process.env.SPONSORED_ARAYANLAR_PREPARE_AMOUNT ?? "1",
);

/** Platform-borne host pack regenerations per submitted revision. */
export const HOST_PACK_REGEN_MAX = Number(process.env.HOST_PACK_REGEN_MAX ?? "3");

export const HOST_PACK_REGEN_WINDOW_MS = Number(
  process.env.HOST_PACK_REGEN_WINDOW_MS ?? String(60 * 60 * 1000),
);

export const EDITORIAL_TIMELINE = [
  { start: "00:00", end: "00:20", label: "Soğuk açılış" },
  { start: "00:20", end: "00:45", label: "Tanıtım" },
  { start: "00:45", end: "02:00", label: "Konuk kim / hedef rol" },
  { start: "02:00", end: "06:30", label: "Bir gerçek hikâye" },
  { start: "06:30", end: "11:30", label: "Kısa vaka" },
  { start: "11:30", end: "14:00", label: "İstenen rol / ekip / çalışma biçimi" },
  { start: "14:00", end: "16:15", label: "Hızlı tur" },
  { start: "16:15", end: "17:35", label: "Konuğun son sözü" },
  { start: "17:35", end: "18:00", label: "Kapanış" },
] as const;

export type DraftAnswers = {
  targetRole?: string;
  storyTopic?: string;
  contribution?: string;
  workPreferences?: string;
  excludedTopics?: string;
  contactChannel?: string;
  extraNotes?: string;
  /** Internal grounding labels; stripped before host-facing submitted facts. */
  sourceHints?: string[];
};

export type ConversationTurn = {
  role: "assistant" | "member";
  content: string;
  at: string;
  questionKey?: string;
  skipped?: boolean;
};

export type SubmittedFacts = {
  displayName: string;
  targetRole: string;
  storyTopic: string;
  contribution: string;
  workPreferences: string;
  excludedTopics: string;
  contactChannel: string;
  profileHintsUsed: string[];
  memberNotes?: string;
};
