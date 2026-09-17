import { prisma } from "@/lib/db";
import { canHostAccessApplication, isAuthorizedHost } from "@/lib/arayanlar/host-auth";
import {
  DEFAULT_RECORDING_TIMEZONE,
  formatRecordingSchedule,
  isAllowedRecordingTimezone,
  wallTimeToUtc,
} from "@/lib/arayanlar/recording-time";
import {
  notifyArayanlarRecordingRescheduled,
  notifyArayanlarRecordingScheduleCancelled,
  notifyArayanlarRecordingScheduled,
} from "@/lib/arayanlar/notifications";

const NOTE_MAX = 500;
/** Reject new schedules more than this far in the past. */
const PAST_SLACK_MS = 60 * 60 * 1000;

export type RecordingScheduleView = {
  scheduled: boolean;
  scheduledAt: Date | null;
  timeZone: string | null;
  meetingUrl: string | null;
  note: string | null;
  displayWhen: string | null;
  scheduleVersion: number;
  completedAt: Date | null;
};

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

export function toRecordingScheduleView(app: {
  recordingScheduledAt: Date | null;
  recordingTimezone: string | null;
  recordingMeetingUrl: string | null;
  recordingSchedulingNote: string | null;
  recordingScheduleVersion: number;
  recordingCompletedAt: Date | null;
}): RecordingScheduleView {
  const scheduled = Boolean(app.recordingScheduledAt);
  const timeZone = app.recordingTimezone;
  return {
    scheduled,
    scheduledAt: app.recordingScheduledAt,
    timeZone,
    meetingUrl: app.recordingMeetingUrl,
    note: app.recordingSchedulingNote,
    displayWhen:
      app.recordingScheduledAt && timeZone
        ? formatRecordingSchedule({
            scheduledAt: app.recordingScheduledAt,
            timeZone,
          })
        : null,
    scheduleVersion: app.recordingScheduleVersion,
    completedAt: app.recordingCompletedAt,
  };
}

/**
 * Host (assigned + authorized) or ADMIN staff may mutate schedule.
 * Candidate / unrelated members cannot.
 */
export async function canMutateRecordingSchedule(options: {
  actorUserId: string;
  applicationId: string;
}) {
  const actor = await prisma.user.findUnique({
    where: { id: options.actorUserId },
    select: { id: true, staffRole: true },
  });
  if (!actor) return { ok: false as const, reason: "forbidden" };

  const app = await prisma.arayanlarApplication.findUnique({
    where: { id: options.applicationId },
  });
  if (!app || app.status === "WITHDRAWN") {
    return { ok: false as const, reason: "not_found" };
  }

  if (actor.staffRole === "ADMIN") {
    return { ok: true as const, application: app, as: "admin" as const };
  }

  const hostAccess = await canHostAccessApplication({
    hostUserId: options.actorUserId,
    applicationId: options.applicationId,
  });
  if (hostAccess.ok) {
    return { ok: true as const, application: hostAccess.application, as: "host" as const };
  }

  // Authorized host but not yet assigned — still forbid (assignment-gated).
  if (await isAuthorizedHost(options.actorUserId)) {
    return { ok: false as const, reason: "not_assigned" };
  }

  return { ok: false as const, reason: "forbidden" };
}

function normalizeMeetingUrl(raw: string | null | undefined) {
  const value = raw?.trim() || "";
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail("INVALID_MEETING_URL", "Kayıt bağlantısı geçerli bir adres olmalı.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail("INVALID_MEETING_URL", "Kayıt bağlantısı http veya https olmalı.");
  }
  return parsed.toString();
}

function normalizeNote(raw: string | null | undefined) {
  const value = raw?.trim() || "";
  if (!value) return null;
  if (value.length > NOTE_MAX) {
    fail("NOTE_TOO_LONG", `Not en fazla ${NOTE_MAX} karakter olabilir.`);
  }
  return value;
}

function sameInstant(a: Date | null, b: Date) {
  return a != null && a.getTime() === b.getTime();
}

export async function scheduleRecording(options: {
  actorUserId: string;
  applicationId: string;
  date: string;
  time: string;
  timeZone?: string;
  meetingUrl?: string | null;
  note?: string | null;
}) {
  const access = await canMutateRecordingSchedule({
    actorUserId: options.actorUserId,
    applicationId: options.applicationId,
  });
  if (!access.ok) {
    fail("FORBIDDEN", "Bu kaydı planlama yetkin yok.");
  }

  const app = access.application;
  if (app.status !== "SUBMITTED" || app.prepStatus !== "READY") {
    fail("NOT_READY", "Kayıt zamanı yalnızca notlar hazırken belirlenebilir.");
  }

  const timeZone = (options.timeZone?.trim() || DEFAULT_RECORDING_TIMEZONE).trim();
  if (!isAllowedRecordingTimezone(timeZone)) {
    fail("INVALID_TIMEZONE", "Saat dilimi desteklenmiyor.");
  }

  let scheduledAt: Date;
  try {
    scheduledAt = wallTimeToUtc({
      date: options.date,
      time: options.time,
      timeZone,
    });
  } catch {
    fail("INVALID_DATETIME", "Geçerli bir tarih ve saat seç.");
  }

  if (scheduledAt.getTime() < Date.now() - PAST_SLACK_MS) {
    fail("SCHEDULE_IN_PAST", "Kayıt zamanı geçmişte olamaz.");
  }

  const meetingUrl = normalizeMeetingUrl(options.meetingUrl);
  const note = normalizeNote(options.note);
  const hadSchedule = Boolean(app.recordingScheduledAt);

  // Idempotent: identical payload does not bump version or notify.
  if (
    hadSchedule &&
    sameInstant(app.recordingScheduledAt, scheduledAt) &&
    app.recordingTimezone === timeZone &&
    (app.recordingMeetingUrl ?? null) === meetingUrl &&
    (app.recordingSchedulingNote ?? null) === note
  ) {
    return {
      ok: true as const,
      changed: false as const,
      application: app,
      schedule: toRecordingScheduleView(app),
    };
  }

  const nextVersion = app.recordingScheduleVersion + 1;
  const updated = await prisma.arayanlarApplication.update({
    where: { id: app.id },
    data: {
      recordingScheduledAt: scheduledAt,
      recordingTimezone: timeZone,
      recordingMeetingUrl: meetingUrl,
      recordingSchedulingNote: note,
      recordingScheduledByUserId: options.actorUserId,
      recordingScheduleUpdatedAt: new Date(),
      recordingScheduleVersion: nextVersion,
    },
  });

  if (!hadSchedule) {
    await notifyArayanlarRecordingScheduled({
      userId: app.userId,
      applicationId: app.id,
      scheduleVersion: nextVersion,
    });
  } else {
    await notifyArayanlarRecordingRescheduled({
      userId: app.userId,
      applicationId: app.id,
      scheduleVersion: nextVersion,
    });
  }

  return {
    ok: true as const,
    changed: true as const,
    application: updated,
    schedule: toRecordingScheduleView(updated),
  };
}

export async function cancelRecordingSchedule(options: {
  actorUserId: string;
  applicationId: string;
}) {
  const access = await canMutateRecordingSchedule({
    actorUserId: options.actorUserId,
    applicationId: options.applicationId,
  });
  if (!access.ok) {
    fail("FORBIDDEN", "Bu kaydı planlama yetkin yok.");
  }

  const app = access.application;
  if (!app.recordingScheduledAt) {
    return {
      ok: true as const,
      changed: false as const,
      application: app,
      schedule: toRecordingScheduleView(app),
    };
  }

  const nextVersion = app.recordingScheduleVersion + 1;
  const updated = await prisma.arayanlarApplication.update({
    where: { id: app.id },
    data: {
      recordingScheduledAt: null,
      recordingTimezone: null,
      recordingMeetingUrl: null,
      recordingSchedulingNote: null,
      recordingScheduledByUserId: options.actorUserId,
      recordingScheduleUpdatedAt: new Date(),
      recordingScheduleVersion: nextVersion,
      // Do not touch status, prepStatus, artifacts, credits, host auth, withdrawnAt.
    },
  });

  await notifyArayanlarRecordingScheduleCancelled({
    userId: app.userId,
    applicationId: app.id,
    scheduleVersion: nextVersion,
  });

  return {
    ok: true as const,
    changed: true as const,
    application: updated,
    schedule: toRecordingScheduleView(updated),
  };
}

export async function getRecordingScheduleForCandidate(options: {
  candidateUserId: string;
}) {
  const app = await prisma.arayanlarApplication.findUnique({
    where: { userId: options.candidateUserId },
  });
  if (!app) return null;
  return {
    applicationId: app.id,
    status: app.status,
    prepStatus: app.prepStatus,
    schedule: toRecordingScheduleView(app),
  };
}
