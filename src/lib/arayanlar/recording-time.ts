/**
 * Timezone-aware helpers for Kariyer Portresi recording schedule.
 * Store UTC instants; keep an explicit IANA timezone for display.
 */

export const DEFAULT_RECORDING_TIMEZONE = "Europe/Berlin";

export const ALLOWED_RECORDING_TIMEZONES = [
  "Europe/Berlin",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Amsterdam",
  "Europe/Paris",
  "UTC",
] as const;

export type AllowedRecordingTimezone = (typeof ALLOWED_RECORDING_TIMEZONES)[number];

export function isAllowedRecordingTimezone(value: string): value is AllowedRecordingTimezone {
  return (ALLOWED_RECORDING_TIMEZONES as readonly string[]).includes(value);
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Convert a wall-clock date+time in an IANA zone to a UTC Date.
 * Uses iterative correction (DST-safe); does not manually add fixed offsets.
 */
export function wallTimeToUtc(options: {
  date: string;
  time: string;
  timeZone: string;
}): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(options.date.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(options.time.trim());
  if (!dateMatch || !timeMatch) {
    throw Object.assign(new Error("INVALID_DATETIME"), { code: "INVALID_DATETIME" });
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    !Number.isFinite(year)
  ) {
    throw Object.assign(new Error("INVALID_DATETIME"), { code: "INVALID_DATETIME" });
  }

  // Initial guess: treat wall time as UTC, then correct toward the target zone.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const asLocal = zonedParts(new Date(utcMs), options.timeZone);
    const asUtcLike = Date.UTC(
      asLocal.year,
      asLocal.month - 1,
      asLocal.day,
      asLocal.hour,
      asLocal.minute,
      asLocal.second,
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = desired - asUtcLike;
    if (delta === 0) break;
    utcMs += delta;
  }

  const result = new Date(utcMs);
  const check = zonedParts(result, options.timeZone);
  if (
    check.year !== year ||
    check.month !== month ||
    check.day !== day ||
    check.hour !== hour ||
    check.minute !== minute
  ) {
    // Likely a skipped DST gap — reject rather than invent a time.
    throw Object.assign(new Error("INVALID_DATETIME"), { code: "INVALID_DATETIME" });
  }
  return result;
}

/** Human-readable TR schedule line, e.g. "24 Eylül 2026, Perşembe · 19:00" */
export function formatRecordingSchedule(options: {
  scheduledAt: Date;
  timeZone: string;
}): string {
  const d = options.scheduledAt;
  const weekday = new Intl.DateTimeFormat("tr-TR", {
    timeZone: options.timeZone,
    weekday: "long",
  }).format(d);
  const dayMonthYear = new Intl.DateTimeFormat("tr-TR", {
    timeZone: options.timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("tr-TR", {
    timeZone: options.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  const weekdayCap = weekday.charAt(0).toLocaleUpperCase("tr-TR") + weekday.slice(1);
  return `${dayMonthYear}, ${weekdayCap} · ${time}`;
}

export function wallPartsFromUtc(scheduledAt: Date, timeZone: string) {
  const p = zonedParts(scheduledAt, timeZone);
  return {
    date: `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
    time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
  };
}
