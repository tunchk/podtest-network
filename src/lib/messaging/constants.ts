export const MESSAGE_REQUEST_MAX_CHARS = Number(
  process.env.MESSAGE_REQUEST_MAX_CHARS ?? "1000",
);

export const DIRECT_MESSAGE_MAX_CHARS = Number(
  process.env.DIRECT_MESSAGE_MAX_CHARS ?? "4000",
);

export const MESSAGE_SENDS_PER_MINUTE = Number(
  process.env.MESSAGE_SENDS_PER_MINUTE ?? "20",
);

export const MESSAGE_REQUEST_COOLDOWN_DAYS = Number(
  process.env.MESSAGE_REQUEST_COOLDOWN_DAYS ?? "7",
);

/** FREE development default — not a published subscription promise. */
export const MESSAGE_REQUEST_FREE_MONTHLY_ALLOWANCE = Number(
  process.env.MESSAGE_REQUEST_FREE_MONTHLY_ALLOWANCE ?? "5",
);

export const MESSAGE_REQUEST_PLUS_MONTHLY_ALLOWANCE = Number(
  process.env.MESSAGE_REQUEST_PLUS_MONTHLY_ALLOWANCE ?? "40",
);

export const MESSAGE_REQUEST_EMPLOYER_MONTHLY_ALLOWANCE = Number(
  process.env.MESSAGE_REQUEST_EMPLOYER_MONTHLY_ALLOWANCE ?? "50",
);

export const REPORT_EXPLANATION_MAX_CHARS = Number(
  process.env.REPORT_EXPLANATION_MAX_CHARS ?? "2000",
);

export const REPORT_RATE_LIMIT_PER_HOUR = Number(
  process.env.REPORT_RATE_LIMIT_PER_HOUR ?? "10",
);

export const REMOVED_MESSAGE_PLACEHOLDER = "Bu mesaj kaldırıldı.";

export function pairKeyFor(a: string, b: string) {
  return [a, b].sort().join(":");
}

export function orderedPair(a: string, b: string) {
  return a < b ? { low: a, high: b } : { low: b, high: a };
}

export function utcYearMonth(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function nextUtcMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

export function cooldownUntil(from = new Date()) {
  return new Date(from.getTime() + MESSAGE_REQUEST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}
