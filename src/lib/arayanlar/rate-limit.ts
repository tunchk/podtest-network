/**
 * Server-side limits for Arayanlar pre-submission preparation (M2.2 follow-up).
 */
export const ARAYANLAR_CHAT_MAX_INPUT_CHARS = Number(
  process.env.ARAYANLAR_CHAT_MAX_INPUT_CHARS ?? "2000",
);

export const ARAYANLAR_CHAT_MAX_CONCURRENT = Number(
  process.env.ARAYANLAR_CHAT_MAX_CONCURRENT ?? "1",
);

export const ARAYANLAR_CHAT_RETRY_WINDOW_MS = Number(
  process.env.ARAYANLAR_CHAT_RETRY_WINDOW_MS ?? "10000",
);

export const ARAYANLAR_CHAT_MAX_RETRIES_PER_WINDOW = Number(
  process.env.ARAYANLAR_CHAT_MAX_RETRIES_PER_WINDOW ?? "8",
);

const inflight = new Map<string, number>();
const recentHits = new Map<string, number[]>();

export function assertArayanlarChatLimits(userId: string, messageLength: number) {
  if (messageLength > ARAYANLAR_CHAT_MAX_INPUT_CHARS) {
    throw Object.assign(new Error("INPUT_TOO_LONG"), { code: "INPUT_TOO_LONG" });
  }

  const now = Date.now();
  const hits = (recentHits.get(userId) ?? []).filter((t) => now - t < ARAYANLAR_CHAT_RETRY_WINDOW_MS);
  if (hits.length >= ARAYANLAR_CHAT_MAX_RETRIES_PER_WINDOW) {
    throw Object.assign(new Error("RATE_LIMITED"), { code: "RATE_LIMITED" });
  }
  hits.push(now);
  recentHits.set(userId, hits);

  const current = inflight.get(userId) ?? 0;
  if (current >= ARAYANLAR_CHAT_MAX_CONCURRENT) {
    throw Object.assign(new Error("CONCURRENCY_LIMIT"), { code: "CONCURRENCY_LIMIT" });
  }
  inflight.set(userId, current + 1);
}

export function releaseArayanlarChatSlot(userId: string) {
  const current = inflight.get(userId) ?? 0;
  if (current <= 1) inflight.delete(userId);
  else inflight.set(userId, current - 1);
}
