"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Quote = { cost: number; available: number; canAfford: boolean; currencyLabel: string };
type JobView = {
  id: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  creditCostSnapshot: number;
  resultConflict: boolean;
  safeErrorMessage: string | null;
  providerMode: string | null;
  labeledStub: boolean;
  suggestions: null | {
    fields: Record<
      string,
      | null
      | {
          value: unknown;
          source: string;
          uncertain: boolean;
          note: string | null;
        }
    >;
    missingOrUncertain: string[];
    warnings: string[];
  };
};

const FIELD_LABELS: Record<string, string> = {
  displayName: "Görünen ad",
  headline: "Başlık",
  bio: "Biyografi",
  skills: "Beceriler",
  interests: "İlgi alanları",
  experience: "Deneyim",
  education: "Eğitim",
  projects: "Projeler",
  languages: "Diller",
  location: "Konum",
  workPreferences: "Çalışma tercihleri",
  publicLinks: "Bağlantılar",
};

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    if (value.length && typeof value[0] === "object" && value[0] && "url" in (value[0] as object)) {
      return (value as { url: string }[]).map((v) => v.url).join("\n");
    }
    return value.map(String).join(", ");
  }
  return String(value);
}

export function CvAssistPanel({
  draftRevision,
  currentSummary,
}: {
  draftRevision: number;
  currentSummary: Record<string, string>;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [providerStatus, setProviderStatus] = useState<{
    mode: string;
    demoStub: boolean;
    hasOpenAiKey: boolean;
    openaiModel: string | null;
  } | null>(null);
  const [cvId, setCvId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});

  const loadQuote = useCallback(async () => {
    const res = await fetch("/api/ai/profile-prepare?quote=1");
    if (res.ok) setQuote(await res.json());
  }, []);

  const loadProvider = useCallback(async () => {
    const res = await fetch("/api/ai/provider-status");
    if (res.ok) setProviderStatus(await res.json());
  }, []);

  useEffect(() => {
    void loadQuote();
    void loadProvider();
  }, [loadQuote, loadProvider]);

  useEffect(() => {
    if (!job || (job.status !== "QUEUED" && job.status !== "RUNNING")) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/ai/profile-prepare?id=${job.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setJob(data.job);
      if (data.job.status === "READY" && data.job.suggestions?.fields) {
        const nextAccepted: Record<string, boolean> = {};
        const nextEdits: Record<string, string> = {};
        for (const [key, field] of Object.entries(data.job.suggestions.fields as Record<string, { value?: unknown } | null>)) {
          if (field && field.value != null && formatValue(field.value).trim()) {
            nextAccepted[key] = false;
            nextEdits[key] = formatValue(field.value);
          }
        }
        setAccepted(nextAccepted);
        setEdits(nextEdits);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [job]);

  const fieldKeys = useMemo(
    () => (job?.suggestions?.fields ? Object.keys(job.suggestions.fields) : []),
    [job],
  );

  async function onUpload(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/cv", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "Yükleme başarısız.");
        setCvId(null);
        return;
      }
      setCvId(data.documentId);
      setMessage("CV yüklendi ve metin çıkarıldı. Maliyeti onaylayıp işi başlatabilirsiniz.");
    } finally {
      setBusy(false);
    }
  }

  async function onPaste() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: paste }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "Metin kaydedilemedi.");
        return;
      }
      setCvId(data.documentId);
      setMessage("Yapıştırılan metin kaydedildi.");
    } finally {
      setBusy(false);
    }
  }

  async function startJob() {
    if (!cvId || !quote) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ai/profile-prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvDocumentId: cvId, confirmCost: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(
          data.error === "insufficient_credits"
            ? "Yeterli AI krediniz yok."
            : "İş başlatılamadı.",
        );
        return;
      }
      setJob(data.job);
      setMessage(`İş kuyruğa alındı (${quote.cost} kredi ayrıldı). Worker çalışıyorsa sonuç gelecek.`);
      await loadQuote();
    } finally {
      setBusy(false);
    }
  }

  async function cancelJob() {
    if (!job) return;
    const res = await fetch("/api/ai/profile-prepare", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, action: "cancel" }),
    });
    if (res.ok) {
      const data = await res.json();
      setJob(data.job);
      await loadQuote();
    }
  }

  async function retryJob() {
    if (!job) return;
    const res = await fetch("/api/ai/profile-prepare", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, action: "retry" }),
    });
    if (res.ok) {
      const data = await res.json();
      setJob(data.job);
    }
  }

  async function applySelected() {
    if (!job) return;
    setBusy(true);
    setMessage(null);
    try {
      const acceptedFields = Object.entries(accepted)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const editPayload: Record<string, unknown> = {};
      for (const key of acceptedFields) {
        const raw = edits[key] ?? "";
        if (key === "skills" || key === "interests" || key === "languages") {
          editPayload[key] = raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
        } else if (key === "publicLinks") {
          editPayload[key] = raw
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((url) => ({ url }));
        } else {
          editPayload[key] = raw;
        }
      }

      const res = await fetch("/api/ai/profile-prepare/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          acceptedFields,
          edits: editPayload,
          expectedDraftRevision: draftRevision,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setMessage(data.message);
        return;
      }
      if (!res.ok) {
        setMessage("Uygulanamadı.");
        return;
      }
      setMessage("Seçilen öneriler özel taslağa uygulandı. Yayın veya moderasyon otomatik tetiklenmedi.");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl">CV ile profil önerisi (isteğe bağlı)</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          CV yüklemek veya yapay zekâ kullanmak zorunlu değil. Öneriler yalnızca özel taslağa uygulanır;
          kamuya açık görünüme veya incelemeye otomatik gitmez.
        </p>
        {providerStatus?.demoStub ? (
          <p className="mt-3 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-strong)]">
            Yerel demo stub açıkça etkin (AI_DEMO_STUB / AI_ALLOW_STUB / AI_PROVIDER=stub). Bu canlı
            yapay zekâ değildir.
          </p>
        ) : null}
        {providerStatus && !providerStatus.demoStub && providerStatus.mode === "unavailable" ? (
          <p className="mt-3 rounded-md border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]">
            Yapay zekâ sağlayıcısı yapılandırılmadı (OPENAI_API_KEY yok). İşler başarısız/unavailable
            döner; stub sessizce devreye girmez.
          </p>
        ) : null}
        {providerStatus?.mode === "openai" ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Canlı sağlayıcı: OpenAI ({providerStatus.openaiModel ?? "model ayarlı"}).
          </p>
        ) : null}
      </div>

      {quote ? (
        <p className="text-sm">
          Bu işin maliyeti: <strong>{quote.cost}</strong> {quote.currencyLabel}. Kullanılabilir:{" "}
          <strong>{quote.available}</strong>
          {!quote.canAfford ? " — yetersiz bakiye." : null}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="field mb-0">
          <label htmlFor="cv-file">PDF / DOCX yükle (en fazla 5 MB)</label>
          <input
            id="cv-file"
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
            }}
          />
        </div>
        <div className="field mb-0">
          <label htmlFor="cv-paste">Metin yapıştır (alternatif)</label>
          <textarea
            id="cv-paste"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="CV metnini buraya yapıştırın"
          />
          <button type="button" className="btn btn-ghost mt-2" disabled={busy || !paste.trim()} onClick={() => void onPaste()}>
            Metni kaydet
          </button>
        </div>
      </div>

      {cvId ? <p className="text-xs text-[var(--muted)]">Hazır girdi: {cvId}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !cvId || !quote?.canAfford}
          onClick={() => void startJob()}
        >
          Maliyeti onayla ve işi başlat
        </button>
        {job && (job.status === "QUEUED" || job.status === "RUNNING") ? (
          <button type="button" className="btn btn-ghost" onClick={() => void cancelJob()}>
            İptal
          </button>
        ) : null}
        {job?.status === "FAILED" ? (
          <button type="button" className="btn btn-secondary" onClick={() => void retryJob()}>
            Yeniden dene
          </button>
        ) : null}
      </div>

      {message ? <p className="text-sm text-[var(--accent-strong)]">{message}</p> : null}

      {job ? (
        <div className="rounded-lg border border-[var(--line)] p-3 text-sm">
          <p>
            Durum: <strong>{job.status}</strong> · deneme {job.attemptCount}/{job.maxAttempts}
            {job.labeledStub ? " · [YEREL STUB — canlı AI değil]" : null}
          </p>
          {job.safeErrorMessage ? <p className="mt-1 text-[var(--danger)]">{job.safeErrorMessage}</p> : null}
          {job.status === "QUEUED" || job.status === "RUNNING" ? (
            <p className="mt-1 text-[var(--muted)]">
              İşleniyor… Worker yoksa iş kuyrukta kalır; sayfa süresiz başarı göstermez.
            </p>
          ) : null}
        </div>
      ) : null}

      {job?.status === "READY" && job.suggestions ? (
        <div className="space-y-4">
          {job.resultConflict ? (
            <p className="rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm">
              Profil işlem sırasında değişti. Mevcut taslak korunur; yalnızca seçtiğiniz alanlar güncellenir.
            </p>
          ) : null}
          {job.suggestions.warnings?.map((w) => (
            <p key={w} className="text-sm text-[var(--warning)]">
              {w}
            </p>
          ))}
          {job.suggestions.missingOrUncertain?.length ? (
            <p className="text-sm text-[var(--muted)]">
              Belirsiz/eksik: {job.suggestions.missingOrUncertain.join(", ")}
            </p>
          ) : null}

          <ul className="space-y-3">
            {fieldKeys.map((key) => {
              const field = job.suggestions?.fields?.[key];
              if (!field || field.value == null || !formatValue(field.value).trim()) return null;
              return (
                <li key={key} className="rounded-lg border border-[var(--line)] p-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(accepted[key])}
                      onChange={(e) => setAccepted((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                    <span>
                      <strong>{FIELD_LABELS[key] ?? key}</strong>
                      <span className="text-[var(--muted)]">
                        {" "}
                        · kaynak: {field.source}
                        {field.uncertain ? " · belirsiz" : ""}
                      </span>
                      {field.note ? <span className="block text-xs text-[var(--muted)]">{field.note}</span> : null}
                    </span>
                  </label>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-[var(--muted)]">Mevcut taslak</p>
                      <p className="whitespace-pre-wrap text-sm">{currentSummary[key] || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--muted)]">Öneri (düzenlenebilir)</p>
                      <textarea
                        className="w-full rounded-md border border-[var(--line)] p-2 text-sm"
                        value={edits[key] ?? ""}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void applySelected()}>
            Seçilenleri özel taslağa uygula
          </button>
        </div>
      ) : null}
    </section>
  );
}
