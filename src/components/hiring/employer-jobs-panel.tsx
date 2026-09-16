"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type JobRow = {
  id: string;
  title: string;
  status: string;
  slug: string;
};

export function EmployerJobsPanel({
  workspaceId,
  jobs,
}: {
  workspaceId: string;
  jobs: JobRow[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [location, setLocation] = useState("");
  const [remoteType, setRemoteType] = useState("UNSPECIFIED");
  const [employmentType, setEmploymentType] = useState("FULL_TIME");
  const [skills, setSkills] = useState("");
  const [applicationUrl, setApplicationUrl] = useState("https://");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createAndSubmit() {
    setError(null);
    setBusy(true);
    try {
      const createRes = await fetch(`/api/isveren/${workspaceId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title,
          description,
          responsibilities: responsibilities || null,
          location: location || null,
          remoteType,
          employmentType,
          skills: skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          applicationMethod: "EXTERNAL_URL",
          applicationUrl,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        setError(created.error ?? "Hata");
        return;
      }
      const submitRes = await fetch(`/api/isveren/${workspaceId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", jobId: created.job.id }),
      });
      const submitted = await submitRes.json();
      if (!submitRes.ok) {
        setError(
          submitted.error === "ACTIVE_JOB_LIMIT"
            ? "Pilot ilan sınırına ulaşıldı. Yükseltme satışı yok; mevcut ilanı kapatın."
            : (submitted.error ?? "Hata"),
        );
        return;
      }
      setMsg(`Durum: ${submitted.job.status}`);
      setTitle("");
      setDescription("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function act(jobId: string, action: "close" | "remove") {
    setError(null);
    const res = await fetch(`/api/isveren/${workspaceId}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, jobId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Hata");
      return;
    }
    setMsg(action === "close" ? "İlan kapatıldı." : "İlan kaldırıldı.");
    router.refresh();
  }

  const statusLabel: Record<string, string> = {
    DRAFT: "Taslak",
    PENDING_REVIEW: "İncelemede",
    PUBLISHED: "Yayımlı",
    REJECTED: "Reddedildi",
    CLOSED: "Kapalı",
    REMOVED: "Kaldırıldı",
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <input
          className="w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          placeholder="İlan başlığı"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="min-h-28 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          placeholder="Açıklama"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <textarea
          className="min-h-20 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          placeholder="Sorumluluklar (isteğe bağlı)"
          value={responsibilities}
          onChange={(e) => setResponsibilities(e.target.value)}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
            placeholder="Konum"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <input
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
            placeholder="Beceriler (virgülle)"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
          />
          <select
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
            value={remoteType}
            onChange={(e) => setRemoteType(e.target.value)}
            aria-label="Çalışma biçimi"
          >
            <option value="UNSPECIFIED">Belirtilmemiş</option>
            <option value="REMOTE">Uzaktan</option>
            <option value="HYBRID">Hibrit</option>
            <option value="ON_SITE">Ofiste</option>
          </select>
          <select
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
            aria-label="İstihdam türü"
          >
            <option value="FULL_TIME">Tam zamanlı</option>
            <option value="PART_TIME">Yarı zamanlı</option>
            <option value="CONTRACT">Sözleşmeli</option>
            <option value="INTERNSHIP">Staj</option>
          </select>
        </div>
        <input
          className="w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          placeholder="Harici başvuru URL (https)"
          value={applicationUrl}
          onChange={(e) => setApplicationUrl(e.target.value)}
        />
        <p className="text-xs text-[var(--muted)]">
          Harici bağlantılar doğrulanır ve açıkça işaretlenir. ATS veya CV toplama yoktur.
        </p>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
        <button
          type="button"
          disabled={busy || !title.trim() || !description.trim()}
          onClick={() => void createAndSubmit()}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Taslak oluştur ve yayımla
        </button>
      </div>

      <ul className="space-y-3 text-sm">
        {jobs.length === 0 ? (
          <li className="text-[var(--muted)]">Henüz ilan yok.</li>
        ) : (
          jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] pb-2">
              <span className="font-medium">{j.title}</span>
              <span className="text-[var(--muted)]">· {statusLabel[j.status] ?? j.status}</span>
              {j.status === "PUBLISHED" ? (
                <a href={`/is-ilanlari/${j.slug}`} className="underline">
                  Kamu sayfası
                </a>
              ) : null}
              {j.status === "PUBLISHED" || j.status === "PENDING_REVIEW" || j.status === "DRAFT" ? (
                <button
                  type="button"
                  className="rounded border px-2 py-0.5 text-xs"
                  onClick={() => void act(j.id, "close")}
                >
                  Kapat
                </button>
              ) : null}
              {j.status !== "REMOVED" ? (
                <button
                  type="button"
                  className="rounded border px-2 py-0.5 text-xs"
                  onClick={() => void act(j.id, "remove")}
                >
                  Kaldır
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
