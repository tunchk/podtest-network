import { createNotification } from "@/lib/notifications/service";

/** Milestone notification kinds for Kariyer Portresi (routes/keys stay arayanlar_*). */
export const ARAYANLAR_NOTIF = {
  submitted: "arayanlar_application_submitted",
  prepReady: "arayanlar_prep_ready",
  prepFailedRetryable: "arayanlar_prep_failed_retryable",
  withdrawn: "arayanlar_application_withdrawn",
  recordingScheduled: "arayanlar_recording_scheduled",
  recordingRescheduled: "arayanlar_recording_rescheduled",
  recordingScheduleCancelled: "arayanlar_recording_schedule_cancelled",
} as const;

function revisionKey(eventKey: string, applicationId: string, revision: number) {
  return `${eventKey}:${applicationId}:r${revision}`;
}

function scheduleKey(eventKey: string, applicationId: string, scheduleVersion: number) {
  return `${eventKey}:${applicationId}:v${scheduleVersion}`;
}

/** Actual submit transition only — never from GET/poll. */
export async function notifyArayanlarApplicationSubmitted(options: {
  userId: string;
  applicationId: string;
  revision: number;
}) {
  return createNotification({
    userId: options.userId,
    kind: ARAYANLAR_NOTIF.submitted,
    title: "Başvurun alındı",
    body: "Kariyer Portresi başvurun alındı. Kayıt öncesi notların hazır olduğunda sana haber vereceğiz.",
    href: "/arayanlar/basvurum",
    payload: {
      applicationId: options.applicationId,
      submittedRevision: options.revision,
    },
    dedupeKey: revisionKey(ARAYANLAR_NOTIF.submitted, options.applicationId, options.revision),
  });
}

/** Preparation READY milestone — guest brief only. */
export async function notifyArayanlarPrepReady(options: {
  userId: string;
  applicationId: string;
  revision: number;
}) {
  return createNotification({
    userId: options.userId,
    kind: ARAYANLAR_NOTIF.prepReady,
    title: "Kayıt öncesi notların hazır",
    body: "Kariyer Portresi kaydın için hazırlanan notları şimdi inceleyebilirsin.",
    href: "/arayanlar/hazirligim",
    payload: {
      applicationId: options.applicationId,
      submittedRevision: options.revision,
    },
    dedupeKey: revisionKey(ARAYANLAR_NOTIF.prepReady, options.applicationId, options.revision),
  });
}

/**
 * User-actionable retryable failure only.
 * Do not call for auto-requeue / internal retries (QUEUED again).
 */
export async function notifyArayanlarPrepFailedRetryable(options: {
  userId: string;
  applicationId: string;
  revision: number;
  attemptCount: number;
  maxAttempts: number;
}) {
  if (options.attemptCount >= options.maxAttempts) {
    return { created: false as const, skipped: "terminal" as const };
  }
  const result = await createNotification({
    userId: options.userId,
    kind: ARAYANLAR_NOTIF.prepFailedRetryable,
    title: "Kayıt öncesi notlar oluşturulamadı",
    body: "Başvurun ve bilgilerin güvende. Kayıt öncesi notları ücretsiz yeniden oluşturmayı deneyebilirsin.",
    href: "/arayanlar/basvurum",
    payload: {
      applicationId: options.applicationId,
      submittedRevision: options.revision,
    },
    dedupeKey: revisionKey(
      ARAYANLAR_NOTIF.prepFailedRetryable,
      options.applicationId,
      options.revision,
    ),
  });
  return { ...result, skipped: null };
}

export async function notifyArayanlarApplicationWithdrawn(options: {
  userId: string;
  applicationId: string;
  revision: number;
}) {
  return createNotification({
    userId: options.userId,
    kind: ARAYANLAR_NOTIF.withdrawn,
    title: "Başvurun geri çekildi",
    body: "Kariyer Portresi başvurun geri çekildi.",
    href: "/arayanlar",
    payload: {
      applicationId: options.applicationId,
      submittedRevision: options.revision,
    },
    dedupeKey: revisionKey(ARAYANLAR_NOTIF.withdrawn, options.applicationId, options.revision),
  });
}

export async function notifyArayanlarRecordingScheduled(options: {
  userId: string;
  applicationId: string;
  scheduleVersion: number;
}) {
  return createNotification({
    userId: options.userId,
    kind: ARAYANLAR_NOTIF.recordingScheduled,
    title: "Kariyer Portresi kayıt zamanı belirlendi",
    body: "Kayıt zamanın belirlendi. Detayları başvurunda görebilirsin.",
    href: "/arayanlar/basvurum",
    payload: {
      applicationId: options.applicationId,
      scheduleVersion: options.scheduleVersion,
    },
    dedupeKey: scheduleKey(
      ARAYANLAR_NOTIF.recordingScheduled,
      options.applicationId,
      options.scheduleVersion,
    ),
  });
}

export async function notifyArayanlarRecordingRescheduled(options: {
  userId: string;
  applicationId: string;
  scheduleVersion: number;
}) {
  return createNotification({
    userId: options.userId,
    kind: ARAYANLAR_NOTIF.recordingRescheduled,
    title: "Kariyer Portresi kayıt zamanın güncellendi",
    body: "Kayıt zamanın değişti. Güncel detayları başvurunda görebilirsin.",
    href: "/arayanlar/basvurum",
    payload: {
      applicationId: options.applicationId,
      scheduleVersion: options.scheduleVersion,
    },
    dedupeKey: scheduleKey(
      ARAYANLAR_NOTIF.recordingRescheduled,
      options.applicationId,
      options.scheduleVersion,
    ),
  });
}

export async function notifyArayanlarRecordingScheduleCancelled(options: {
  userId: string;
  applicationId: string;
  scheduleVersion: number;
}) {
  return createNotification({
    userId: options.userId,
    kind: ARAYANLAR_NOTIF.recordingScheduleCancelled,
    title: "Kariyer Portresi kayıt planı güncellendi",
    body: "Planlanan kayıt zamanı kaldırıldı. Yeni zaman belirlendiğinde sana haber vereceğiz.",
    href: "/arayanlar/basvurum",
    payload: {
      applicationId: options.applicationId,
      scheduleVersion: options.scheduleVersion,
    },
    dedupeKey: scheduleKey(
      ARAYANLAR_NOTIF.recordingScheduleCancelled,
      options.applicationId,
      options.scheduleVersion,
    ),
  });
}
