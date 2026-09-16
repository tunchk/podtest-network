/** Anti-abuse defaults for community Q&A — not commercial package promises. */

export const COMMUNITY_QUESTION_TITLE_MAX = Number(
  process.env.COMMUNITY_QUESTION_TITLE_MAX ?? "160",
);
export const COMMUNITY_QUESTION_BODY_MAX = Number(
  process.env.COMMUNITY_QUESTION_BODY_MAX ?? "5000",
);
export const COMMUNITY_ANSWER_BODY_MAX = Number(
  process.env.COMMUNITY_ANSWER_BODY_MAX ?? "5000",
);
export const COMMUNITY_QUESTIONS_PER_DAY = Number(
  process.env.COMMUNITY_QUESTIONS_PER_DAY ?? "5",
);
export const COMMUNITY_ANSWERS_PER_DAY = Number(
  process.env.COMMUNITY_ANSWERS_PER_DAY ?? "20",
);
export const COMMUNITY_TOPIC_TAG_MAX = Number(process.env.COMMUNITY_TOPIC_TAG_MAX ?? "8");
export const COMMUNITY_TOPIC_TAG_LENGTH = Number(process.env.COMMUNITY_TOPIC_TAG_LENGTH ?? "40");
export const COMMUNITY_LIST_PAGE_SIZE = Number(process.env.COMMUNITY_LIST_PAGE_SIZE ?? "20");

export const EXPERT_FAQ_QUESTION_MAX = Number(process.env.EXPERT_FAQ_QUESTION_MAX ?? "300");
export const EXPERT_FAQ_ANSWER_MAX = Number(process.env.EXPERT_FAQ_ANSWER_MAX ?? "5000");
export const TARGETED_QUESTION_MAX = Number(process.env.TARGETED_QUESTION_MAX ?? "2000");
export const TARGETED_QUESTIONS_PER_DAY = Number(process.env.TARGETED_QUESTIONS_PER_DAY ?? "5");

export const SPEAKER_INVITATION_TTL_HOURS = Number(
  process.env.SPEAKER_INVITATION_TTL_HOURS ?? "168",
);
export const EMAIL_VERIFICATION_TTL_HOURS = Number(
  process.env.EMAIL_VERIFICATION_TTL_HOURS ?? "24",
);

export const COMMUNITY_MODERATION_ADAPTER = "rule-based-heuristic";
export const COMMUNITY_MODERATION_POLICY_VERSION = "m3.2-community-rule-v1";

export function utcDayKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
