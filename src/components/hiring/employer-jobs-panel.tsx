"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ui } from "@/lib/ui-copy";

type JobRow = {
  id: string;
  title: string;
  status: string;
  slug: string;
};

type EligibleContact = {
  userId: string;
  role: string;
  name: string | null;
  email: string;
  messagingAvailable: boolean;
};

type ApplicationMethod = "EXTERNAL_URL" | "MESSAGING";

const statusLabel: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING_REVIEW: "İncelemede",
  PUBLISHED: "Yayımlı",
  REJECTED: "Reddedildi",
  CLOSED: "Kapalı",
  REMOVED: "Kaldırıldı",
};

function mapCreateError(code: string | undefined): string {
  switch (code) {
    case "CAPABILITY_DENIED":
      return ui.hiring.noPilotAccess;
    case "ACTIVE_JOB_LIMIT":
      return ui.hiring.slotsExhausted;
    case "APPLICATION_URL_REQUIRED":
      return "Harici başvuru için HTTPS adresi gerekli.";
    case "INVALID_URL":
      return "Geçerli bir https:// adresi girin.";
    case "CONTACT_REQUIRED":
      return "Mesaj yöntemi için görevli bir üye seçin.";
    case "CONTACT_NOT_IN_WORKSPACE":
      return "Seçilen üyenin çalışma alanı üyeliği kaldırılmış veya pasif. Başka bir üye seçin.";
    case "CONTACT_UNAVAILABLE":
      return "Seçilen üye geçici olarak mesajlaşmaya kapalı. Başka bir üye seçin veya daha sonra deneyin.";
    case "INVALID_TITLE":
      return "Geçerli bir ilan başlığı girin.";
    case "INVALID_BODY":
      return "Geçerli bir açıklama girin.";
    default:
      return code ?? "Hata";
  }
}

export function EmployerJobsPanel({
  workspaceId,
  jobs,
  eligibleContacts,
  canCreate,
  createBlockedReason,
}: {
  workspaceId: string;
  jobs: JobRow[];
  eligibleContacts: EligibleContact[];
  canCreate: boolean;
  createBlockedReason: "capability" | "slots" | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [location, setLocation] = useState("");
  const [remoteType, setRemoteType] = useState("UNSPECIFIED");
  const [employmentType, setEmploymentType] = useState("FULL_TIME");
  const [skills, setSkills] = useState("");
  const [applicationMethod, setApplicationMethod] = useState<ApplicationMethod>("EXTERNAL_URL");
  const [applicationUrl, setApplicationUrl] = useState("https://");
  const [contactUserId, setContactUserId] = useState(eligibleContacts[0]?.userId ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const formReady =
    canCreate &&
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    (applicationMethod === "EXTERNAL_URL"
      ? applicationUrl.trim().startsWith("https://")
      : Boolean(contactUserId));

  async function createAndSubmit() {
    if (!canCreate || busy) return;
    setError(null);
    setMsg(null);
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
          applicationMethod,
          applicationUrl: applicationMethod === "EXTERNAL_URL" ? applicationUrl : null,
          contactUserId: applicationMethod === "MESSAGING" ? contactUserId : null,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        setError(mapCreateError(created.error));
        return;
      }
      const submitRes = await fetch(`/api/isveren/${workspaceId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", jobId: created.job.id }),
      });
      const submitted = await submitRes.json();
      if (!submitRes.ok) {
        setError(mapCreateError(submitted.error));
        return;
      }
      const status = String(submitted.job?.status ?? "");
      const label = statusLabel[status] ?? status;
      setMsg(
        status === "PUBLISHED"
          ? `İlan yayımladı. Durum: ${label}.`
          : status === "PENDING_REVIEW"
            ? `İlan incelemeye alındı (otomatik onay yok). Durum: ${label}.`
            : status === "REJECTED"
              ? `İlan reddedildi. Durum: ${label}.`
              : `Gönderildi. Durum: ${label}.`,
      );
      setTitle("");
      setDescription("");
      setResponsibilities("");
      setSkills("");
      setApplicationUrl("https://");
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
      setError(mapCreateError(data.error));
      return;
    }
    setMsg(action === "close" ? "İlan kapatıldı." : "İlan kaldırıldı.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="panel space-y-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl">{ui.hiring.createJob}</h2>

        {createBlockedReason === "capability" ? (
          <p className="text-sm text-[var(--muted)]">{ui.hiring.noPilotAccess}</p>
        ) : null}
        {createBlockedReason === "slots" ? (
          <p className="text-sm text-[var(--muted)]">{ui.hiring.slotsExhausted}</p>
        ) : null}

        <fieldset disabled={!canCreate || busy} className="space-y-3 disabled:opacity-60">
          <input
            className="w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm"
            placeholder="İlan başlığı"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="İlan başlığı"
          />
          <textarea
            className="min-h-28 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm"
            placeholder="Açıklama"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Açıklama"
          />
          <textarea
            className="min-h-20 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm"
            placeholder="Sorumluluklar (isteğe bağlı)"
            value={responsibilities}
            onChange={(e) => setResponsibilities(e.target.value)}
            aria-label="Sorumluluklar"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
              placeholder="Konum"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              aria-label="Konum"
            />
            <input
              className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
              placeholder="Beceriler (virgülle)"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              aria-label="Beceriler"
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

          <fieldset className="space-y-2 rounded-md border border-[var(--line)] p-3">
            <legend className="px-1 text-sm font-medium">Başvuru yöntemi</legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="applicationMethod"
                checked={applicationMethod === "EXTERNAL_URL"}
                onChange={() => setApplicationMethod("EXTERNAL_URL")}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{ui.hiring.methodExternal}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Harici bağlantılar doğrulanır ve açıkça işaretlenir. ATS veya CV toplama yoktur.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="applicationMethod"
                checked={applicationMethod === "MESSAGING"}
                onChange={() => setApplicationMethod("MESSAGING")}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{ui.hiring.methodMessaging}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Aday mevcut mesaj isteği akışını kullanır; engel, red ve kota kuralları geçerlidir.
                </span>
              </span>
            </label>

            {applicationMethod === "EXTERNAL_URL" ? (
              <input
                className="mt-2 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                placeholder="https://..."
                value={applicationUrl}
                onChange={(e) => setApplicationUrl(e.target.value)}
                aria-label={ui.hiring.methodExternal}
              />
            ) : (
              <div className="mt-2 space-y-1">
                <label className="block text-sm" htmlFor="contact-member">
                  {ui.hiring.contactMember}
                </label>
                {eligibleContacts.length === 0 ? (
                  <p className="text-sm text-red-700">
                    Mesajlaşmaya uygun aktif üye yok. Üyelik kaldırılmış veya geçici kısıtlı
                    olabilir; üyeleri kontrol edin.
                  </p>
                ) : (
                  <select
                    id="contact-member"
                    className="w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                    value={contactUserId}
                    onChange={(e) => setContactUserId(e.target.value)}
                    aria-label={ui.hiring.contactMember}
                  >
                    {eligibleContacts.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {(m.name?.trim() || m.email) +
                          (m.role === "OWNER" ? " · Sahip" : " · İşe alım uzmanı")}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </fieldset>
        </fieldset>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
        <button
          type="button"
          disabled={!formReady || busy}
          onClick={() => void createAndSubmit()}
          className="btn btn-primary disabled:opacity-50"
        >
          {busy ? "Gönderiliyor…" : "Taslak oluştur ve yayımla"}
        </button>
        <p className="text-xs text-[var(--muted)]">
          Gönderim moderasyon kurallarına tabidir. Sonuç durumu: Yayımlı, İncelemede veya
          Reddedildi olabilir — sessiz otomatik onay yoktur.
        </p>
      </div>

      <ul className="space-y-3 text-sm">
        {jobs.length === 0 ? (
          <li className="text-[var(--muted)]">Henüz ilan yok.</li>
        ) : (
          jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] pb-2">
              <span className="font-medium">{j.title}</span>
              <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent-strong)]">
                {statusLabel[j.status] ?? j.status}
              </span>
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
