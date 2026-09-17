import type { RecordingScheduleView } from "@/lib/arayanlar/recording-schedule";

/**
 * Candidate read-only recording schedule on başvuru status surfaces.
 * Shown when prep is READY (or a schedule already exists).
 */
export function CandidateRecordingSchedule({
  schedule,
  prepReady,
}: {
  schedule: RecordingScheduleView;
  prepReady: boolean;
}) {
  if (!prepReady && !schedule.scheduled) return null;

  if (!schedule.scheduled) {
    return (
      <article className="panel space-y-2 text-sm">
        <h2 className="font-[family-name:var(--font-display)] text-lg">
          Kayıt zamanı henüz belirlenmedi
        </h2>
        <p className="text-[var(--muted)]">
          Kayıt zamanı netleştiğinde burada görebileceksin. Zamanı host / ekip koordine eder;
          otomatik takvim ataması yoktur.
        </p>
      </article>
    );
  }

  return (
    <article className="panel space-y-3 text-sm">
      <h2 className="font-[family-name:var(--font-display)] text-lg">Kayıt zamanı</h2>
      <p className="text-base text-[var(--ink)]">
        <strong>{schedule.displayWhen}</strong>
      </p>
      {schedule.timeZone ? (
        <p className="text-[var(--muted)]">Saat dilimi: {schedule.timeZone}</p>
      ) : null}
      {schedule.meetingUrl ? (
        <p>
          <a
            href={schedule.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary inline-flex"
          >
            Kayıt bağlantısını aç
          </a>
        </p>
      ) : null}
      {schedule.note ? (
        <p className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--muted)]">
          {schedule.note}
        </p>
      ) : null}
    </article>
  );
}
