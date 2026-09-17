"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ALLOWED_RECORDING_TIMEZONES,
  DEFAULT_RECORDING_TIMEZONE,
} from "@/lib/arayanlar/recording-time";

type ScheduleState = {
  scheduled: boolean;
  displayWhen: string | null;
  timeZone: string | null;
  meetingUrl: string | null;
  note: string | null;
  dateValue: string;
  timeValue: string;
};

export function HostRecordingScheduleForm({
  applicationId,
  initial,
}: {
  applicationId: string;
  initial: ScheduleState;
}) {
  const router = useRouter();
  const [date, setDate] = useState(initial.dateValue);
  const [time, setTime] = useState(initial.timeValue);
  const [timeZone, setTimeZone] = useState(initial.timeZone || DEFAULT_RECORDING_TIMEZONE);
  const [meetingUrl, setMeetingUrl] = useState(initial.meetingUrl ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState(initial.scheduled);
  const [displayWhen, setDisplayWhen] = useState(initial.displayWhen);

  async function submit(action: "schedule" | "cancel") {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/sunucu/basvurular/${applicationId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "cancel"
            ? { action: "cancel" }
            : {
                action: "schedule",
                date,
                time,
                timeZone,
                meetingUrl: meetingUrl.trim() || null,
                note: note.trim() || null,
              },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        schedule?: {
          scheduled?: boolean;
          displayWhen?: string | null;
          timeZone?: string | null;
          meetingUrl?: string | null;
          note?: string | null;
        };
      };
      if (!res.ok) {
        setError(data.message ?? "İşlem başarısız.");
        return;
      }
      if (data.schedule) {
        setScheduled(Boolean(data.schedule.scheduled));
        setDisplayWhen(data.schedule.displayWhen ?? null);
        if (action === "cancel") {
          setStatus("Planlanan kayıt kaldırıldı.");
        } else {
          setStatus(
            data.schedule.scheduled
              ? "Kayıt zamanı kaydedildi."
              : "Kayıt zamanı güncellendi.",
          );
        }
      }
      router.refresh();
    } catch {
      setError("İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel space-y-4 text-sm print:hidden">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg">Kayıt zamanı</h2>
        {scheduled && displayWhen ? (
          <p className="mt-2 text-[var(--muted)]">
            Planlanan: <strong className="text-[var(--ink)]">{displayWhen}</strong>
            {timeZone ? ` · ${timeZone}` : ""}
          </p>
        ) : (
          <p className="mt-2 text-[var(--muted)]">Henüz kayıt zamanı belirlenmedi.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field mb-0">
          <span>Tarih</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field mb-0">
          <span>Saat</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <label className="field mb-0 sm:col-span-2">
          <span>Saat dilimi</span>
          <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
            {ALLOWED_RECORDING_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <label className="field mb-0 sm:col-span-2">
          <span>Kayıt bağlantısı</span>
          <input
            type="url"
            placeholder="https://…"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
          />
        </label>
        <label className="field mb-0 sm:col-span-2">
          <span>Not</span>
          <textarea
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="İsteğe bağlı kısa not"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !date || !time}
          onClick={() => void submit("schedule")}
        >
          {scheduled ? "Kayıt zamanını güncelle" : "Kayıt zamanını belirle"}
        </button>
        {scheduled ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void submit("cancel")}
          >
            Planlanan kaydı iptal et
          </button>
        ) : null}
      </div>
      {status ? (
        <p className="text-[var(--muted)]" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
