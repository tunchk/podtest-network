"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LegalCheckbox } from "@/components/legal/legal-checkbox";
import { LEGAL_COPY } from "@/lib/legal/copy";

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

type UploadPhase = "idle" | "uploading" | "extracted" | "upload_failed" | "extraction_failed";
type PreparePhase = "idle" | "starting" | "queued" | "running" | "ready" | "failed" | "cancelled";

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

const UPLOAD_STATUS_TR: Record<UploadPhase, string> = {
  idle: "Dosya seçilmedi",
  uploading: "Yükleniyor…",
  extracted: "Metin çıkarıldı",
  upload_failed: "Yükleme başarısız",
  extraction_failed: "Metin çıkarma başarısız",
};

const PREPARE_STATUS_TR: Record<PreparePhase, string> = {
  idle: "Hazırlık başlamadı",
  starting: "İş başlatılıyor…",
  queued: "Kuyrukta",
  running: "Yapay zekâ çalışıyor…",
  ready: "Öneriler hazır",
  failed: "Hazırlık başarısız",
  cancelled: "İptal edildi",
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

function preparePhaseFromJob(status: string | undefined): PreparePhase {
  switch (status) {
    case "QUEUED":
      return "queued";
    case "RUNNING":
      return "running";
    case "READY":
      return "ready";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "idle";
  }
}

type SuggestionField = {
  value?: unknown;
  uncertain?: boolean;
  source?: string;
  note?: string | null;
} | null;

function hydrateFromSuggestions(fields: Record<string, SuggestionField>) {
  const nextAccepted: Record<string, boolean> = {};
  const nextEdits: Record<string, string> = {};
  for (const [key, field] of Object.entries(fields)) {
    if (field && field.value != null && formatValue(field.value).trim()) {
      // Default-check grounded, non-uncertain fields so apply is one clear action.
      nextAccepted[key] = !field.uncertain;
      nextEdits[key] = formatValue(field.value);
    }
  }
  return { nextAccepted, nextEdits };
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
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [preparePhase, setPreparePhase] = useState<PreparePhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [liveDraftRevision, setLiveDraftRevision] = useState(draftRevision);
  const [summaryView, setSummaryView] = useState(currentSummary);
  const [cvNoticeAck, setCvNoticeAck] = useState(false);
  const [cvAiDisclosure, setCvAiDisclosure] = useState(false);
  const [cvAiConsent, setCvAiConsent] = useState(false);
  const submitLock = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadQuote = useCallback(async () => {
    const res = await fetch("/api/ai/profile-prepare?quote=1");
    if (res.ok) setQuote(await res.json());
  }, []);

  const loadProvider = useCallback(async () => {
    const res = await fetch("/api/ai/provider-status");
    if (res.ok) setProviderStatus(await res.json());
  }, []);

  useEffect(() => {
    setLiveDraftRevision(draftRevision);
  }, [draftRevision]);

  useEffect(() => {
    setSummaryView(currentSummary);
  }, [currentSummary]);

  useEffect(() => {
    void loadQuote();
    void loadProvider();
  }, [loadQuote, loadProvider]);

  // Restore latest READY profile-prepare job after reload so apply remains possible
  // without starting a new (charged) AI run. Do not clobber in-progress edits if the
  // member already has a READY job open in this session.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/ai/profile-prepare");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (typeof data.draftRevision === "number") {
        setLiveDraftRevision(data.draftRevision);
      }
      const ready = (data.jobs as JobView[] | undefined)?.find(
        (j) => j.status === "READY" && j.suggestions?.fields,
      );
      if (ready && !cancelled) {
        setJob((current) => {
          if (current?.id === ready.id && current.status === "READY") return current;
          return ready;
        });
        setPreparePhase(preparePhaseFromJob(ready.status));
        setAccepted((prev) => {
          if (Object.keys(prev).length) return prev;
          return hydrateFromSuggestions(
            ready.suggestions!.fields as Record<string, SuggestionField>,
          ).nextAccepted;
        });
        setEdits((prev) => {
          if (Object.keys(prev).length) return prev;
          return hydrateFromSuggestions(
            ready.suggestions!.fields as Record<string, SuggestionField>,
          ).nextEdits;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!job || (job.status !== "QUEUED" && job.status !== "RUNNING")) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/ai/profile-prepare?id=${job.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setJob(data.job);
      setPreparePhase(preparePhaseFromJob(data.job.status));
      if (data.job.status === "READY" && data.job.suggestions?.fields) {
        const { nextAccepted, nextEdits } = hydrateFromSuggestions(
          data.job.suggestions.fields as Record<string, SuggestionField>,
        );
        setAccepted(nextAccepted);
        setEdits(nextEdits);
      }
      if (data.job.status === "FAILED" && data.job.safeErrorMessage) {
        setMessage(data.job.safeErrorMessage);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [job]);

  const fieldKeys = useMemo(
    () => (job?.suggestions?.fields ? Object.keys(job.suggestions.fields) : []),
    [job],
  );

  const acceptedCount = useMemo(
    () => Object.values(accepted).filter(Boolean).length,
    [accepted],
  );

  async function onUpload(file: File) {
    if (submitLock.current) return;
    if (!cvNoticeAck || !cvAiDisclosure) {
      setMessage("CV yüklemeden önce aydınlatma ve AI bilgilendirme kutularını işaretleyin.");
      return;
    }
    submitLock.current = true;
    setBusy(true);
    setMessage(null);
    setUploadPhase("uploading");
    setPreparePhase("idle");
    setJob(null);
    setCvId(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("cvNoticeAck", cvNoticeAck ? "true" : "false");
      form.append("cvAiDisclosure", cvAiDisclosure ? "true" : "false");
      form.append("cvAiConsent", cvAiConsent ? "true" : "false");
      const res = await fetch("/api/cv", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const phase = data.phase === "extraction" ? "extraction_failed" : "upload_failed";
        setUploadPhase(phase);
        setMessage(data.message ?? "Yükleme başarısız.");
        setCvId(null);
        return;
      }
      setCvId(data.documentId);
      setUploadPhase("extracted");
      setMessage(
        `CV yüklendi ve metin çıkarıldı (${data.extractedTextChars} karakter). Maliyeti onaylayıp işi başlatabilirsiniz.`,
      );
    } catch {
      setUploadPhase("upload_failed");
      setMessage("Yükleme sırasında ağ hatası oluştu. Yeniden deneyin.");
      setCvId(null);
    } finally {
      setBusy(false);
      submitLock.current = false;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onPaste() {
    if (submitLock.current) return;
    if (!cvNoticeAck || !cvAiDisclosure) {
      setMessage("CV kaydetmeden önce aydınlatma ve AI bilgilendirme kutularını işaretleyin.");
      return;
    }
    submitLock.current = true;
    setBusy(true);
    setMessage(null);
    setUploadPhase("uploading");
    setPreparePhase("idle");
    setJob(null);
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: paste,
          cvNoticeAck,
          cvAiDisclosure,
          cvAiConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setUploadPhase(data.phase === "extraction" ? "extraction_failed" : "upload_failed");
        setMessage(data.message ?? "Metin kaydedilemedi.");
        setCvId(null);
        return;
      }
      setCvId(data.documentId);
      setUploadPhase("extracted");
      setMessage("Yapıştırılan metin kaydedildi.");
    } catch {
      setUploadPhase("upload_failed");
      setMessage("Metin kaydı sırasında ağ hatası oluştu.");
      setCvId(null);
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  async function startJob() {
    if (!cvId || !quote || submitLock.current) return;
    if (!cvAiConsent) {
      setMessage("AI hazırlığı için açık rıza kutusu işaretlenmelidir.");
      setPreparePhase("failed");
      return;
    }
    if (job && (job.status === "QUEUED" || job.status === "RUNNING")) return;
    submitLock.current = true;
    setBusy(true);
    setMessage(null);
    setPreparePhase("starting");
    try {
      // Ensure consent is persisted for this CV before starting (covers older uploads).
      await fetch("/api/yasal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          checked: true,
          type: "CV_AI_CONSENT",
          documentType: "CV_AI_CONSENT",
          scope: "profile_prepare",
          relatedResourceType: "cv_document",
          relatedResourceId: cvId,
        }),
      });
      const res = await fetch("/api/ai/profile-prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvDocumentId: cvId, confirmCost: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreparePhase("failed");
        setMessage(
          data.error === "insufficient_credits"
            ? "Yeterli AI krediniz yok."
            : data.error === "LEGAL_CV_CONSENT_REQUIRED" || data.error === "LEGAL_CV_NOTICE_REQUIRED"
              ? data.message ?? "CV yasal onayları eksik."
              : data.error === "CV_NOT_READY"
                ? "CV metni henüz hazır değil. Dosyayı yeniden yükleyin veya metni yapıştırın."
                : data.message ?? "AI hazırlığı başlatılamadı. Durumu kontrol edip yeniden deneyin.",
        );
        return;
      }
      setJob(data.job);
      setPreparePhase(preparePhaseFromJob(data.job.status));
      setMessage(`İş kuyruğa alındı (${quote.cost} kredi ayrıldı). Worker çalışıyorsa sonuç gelecek.`);
      await loadQuote();
    } catch {
      setPreparePhase("failed");
      setMessage("AI hazırlığı başlatılırken ağ hatası oluştu.");
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  async function cancelJob() {
    if (!job || submitLock.current) return;
    submitLock.current = true;
    try {
      const res = await fetch("/api/ai/profile-prepare", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, action: "cancel" }),
      });
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);
        setPreparePhase(preparePhaseFromJob(data.job?.status));
        await loadQuote();
      }
    } finally {
      submitLock.current = false;
    }
  }

  async function retryJob() {
    if (!job || submitLock.current) return;
    submitLock.current = true;
    setPreparePhase("starting");
    try {
      const res = await fetch("/api/ai/profile-prepare", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, action: "retry" }),
      });
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);
        setPreparePhase(preparePhaseFromJob(data.job.status));
        setMessage(null);
      } else {
        setPreparePhase("failed");
        setMessage("Yeniden deneme başarısız.");
      }
    } finally {
      submitLock.current = false;
    }
  }

  async function applySelected() {
    if (!job || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const acceptedFields = Object.entries(accepted)
        .filter(([, v]) => v)
        .map(([k]) => k);
      if (!acceptedFields.length) {
        setMessage("Uygulamak için en az bir öneri seçin.");
        return;
      }
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
          expectedDraftRevision: liveDraftRevision,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        if (typeof data.currentDraftRevision === "number") {
          setLiveDraftRevision(data.currentDraftRevision);
        }
        // Keep checkbox selections and edits — do not wipe on conflict.
        setMessage(
          `${data.message ?? "Taslak değişti; tekrar deneyin."} Seçimlerin ve düzenlemelerin korundu; tekrar Uygula'ya basabilirsin.`,
        );
        return;
      }
      if (!res.ok) {
        // Keep selections/edits on failure so the member can retry without re-entering text.
        setMessage(data.message ?? "Uygulanamadı. Seçimlerin korundu; tekrar deneyebilirsin.");
        return;
      }
      if (typeof data.draftRevision === "number") {
        setLiveDraftRevision(data.draftRevision);
      }
      setSummaryView((prev) => {
        const next = { ...prev };
        for (const key of acceptedFields) {
          next[key] = edits[key] ?? prev[key] ?? "";
        }
        return next;
      });
      setMessage(
        "Seçilen öneriler özel taslağa uygulandı. Yayın veya moderasyon otomatik tetiklenmedi. Yenilemeden sonra da korunur.",
      );
      // Soft refresh so SSR summary/revision catch up without losing the READY job UI.
      window.location.assign("/hesabim/profil?sekme=cv");
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  const jobBusy = preparePhase === "queued" || preparePhase === "running" || preparePhase === "starting";

  return (
    <section className="panel space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl">CV ile profil önerisi</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          İsteğe bağlı: dosya yükle veya metin yapıştır, maliyeti onayla, önerileri incele ve yalnızca
          seçtiklerini özel taslağa uygula. Yüklemek otomatik AI işlemi başlatmaz ve yayınlamaz.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
          <li>Dosya yükle veya metni yapıştır</li>
          <li>CV'nin hazır olduğunu doğrula</li>
          <li>Krediyi onaylayıp önerileri başlat</li>
          <li>Önerileri gözden geçirip özel taslağa uygula</li>
        </ol>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Aynı özel CV ile Arayanlar bölüm hazırlığına da geçebilirsin:{" "}
          <a href="/arayanlar?kaynak=cv#basvuru" className="text-[var(--accent)] underline">
            CV'mden bölüm hazırlığına başla
          </a>
          . Profil önerilerini uygulamış olman gerekmez.
        </p>
        {providerStatus?.demoStub ? (
          <details className="mt-3 text-sm text-[var(--muted)]">
            <summary className="cursor-pointer text-[var(--accent-strong)]">Sağlayıcı notu</summary>
            <p className="mt-2 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-[var(--accent-strong)]">
              Yerel demo stub açık. Bu canlı yapay zekâ değildir.
            </p>
          </details>
        ) : null}
        {providerStatus && !providerStatus.demoStub && providerStatus.mode === "unavailable" ? (
          <details className="mt-3 text-sm text-[var(--muted)]">
            <summary className="cursor-pointer">Sağlayıcı durumu</summary>
            <p className="mt-2 rounded-md border border-[var(--line)] px-3 py-2">
              Yapay zekâ sağlayıcısı yapılandırılmadı. Öneri işi başlatılamaz; metni yapıştırıp
              taslağı elle düzenleyebilirsin.
            </p>
          </details>
        ) : null}
        {providerStatus?.mode === "openai" ? (
          <details className="mt-3 text-sm text-[var(--muted)]">
            <summary className="cursor-pointer">Sağlayıcı bilgisi</summary>
            <p className="mt-2">Canlı sağlayıcı yapılandırılmış. CV yüklemek otomatik olarak AI
              işlemi başlatmaz; maliyeti onaylaman gerekir.</p>
          </details>
        ) : null}
      </div>

      {quote ? (
        <p className="text-sm">
          Bu işin maliyeti: <strong>{quote.cost}</strong> {quote.currencyLabel}. Kullanılabilir:{" "}
          <strong>{quote.available}</strong>
          {!quote.canAfford ? " — yetersiz bakiye." : null}
        </p>
      ) : null}

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p>
          Yükleme / çıkarma: <strong>{UPLOAD_STATUS_TR[uploadPhase]}</strong>
        </p>
        <p>
          AI hazırlığı: <strong>{PREPARE_STATUS_TR[preparePhase]}</strong>
        </p>
      </div>

      <fieldset className="space-y-2 rounded-md border border-[var(--line)] p-3 text-sm">
        <legend className="px-1 font-medium">CV gizlilik onayları</legend>
        <p className="text-[var(--muted)]">{LEGAL_COPY.cvLead}</p>
        <LegalCheckbox
          id="cv-notice"
          label={LEGAL_COPY.cvNoticeAck}
          href="/yasal/cv_ai_processing_notice"
          checked={cvNoticeAck}
          onChange={setCvNoticeAck}
          required
        />
        <LegalCheckbox
          id="cv-ai-disc"
          label={LEGAL_COPY.cvAiDisclosure}
          href="/yasal/cv_ai_processing_notice"
          checked={cvAiDisclosure}
          onChange={setCvAiDisclosure}
          required
        />
        <LegalCheckbox
          id="cv-ai-consent"
          label={LEGAL_COPY.cvAiConsent}
          href="/yasal/cv_ai_consent"
          checked={cvAiConsent}
          onChange={setCvAiConsent}
        />
        <p className="text-xs text-[var(--muted)]">
          Kutular önceden işaretli değildir. AI rızası yükleme için yeterli değildir; önerileri
          profile uygulamak ayrıca senin seçimindir. Ham CV profil görünürlüğü ile kamuya açılmaz.
        </p>
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="field mb-0">
          <label htmlFor="cv-file">PDF / DOCX yükle (en fazla 5 MB)</label>
          <input
            id="cv-file"
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            disabled={busy || jobBusy || !cvNoticeAck || !cvAiDisclosure}
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
            disabled={busy || jobBusy || !cvNoticeAck || !cvAiDisclosure}
          />
          <button
            type="button"
            className="btn btn-ghost mt-2"
            disabled={busy || jobBusy || !paste.trim() || !cvNoticeAck || !cvAiDisclosure}
            onClick={() => void onPaste()}
          >
            Metni kaydet
          </button>
        </div>
      </div>

      {cvId && uploadPhase === "extracted" ? (
        <p className="text-xs text-[var(--muted)]">Hazır girdi kaydı oluşturuldu.</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || jobBusy || !cvId || !quote?.canAfford || uploadPhase !== "extracted" || !cvAiConsent}
          onClick={() => void startJob()}
        >
          Maliyeti onayla ve AI hazırlığını başlat
        </button>
        {job && (job.status === "QUEUED" || job.status === "RUNNING") ? (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void cancelJob()}>
            İptal
          </button>
        ) : null}
        {job?.status === "FAILED" ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void retryJob()}>
            Yeniden dene
          </button>
        ) : null}
      </div>

      {message ? (
        <p
          className={`text-sm ${
            uploadPhase.includes("failed") || preparePhase === "failed"
              ? "text-[var(--danger)]"
              : "text-[var(--accent-strong)]"
          }`}
          role="status"
        >
          {message}
        </p>
      ) : null}

      {job ? (
        <div className="rounded-lg border border-[var(--line)] p-3 text-sm">
          <p>
            Durum: <strong>{PREPARE_STATUS_TR[preparePhase]}</strong> ({job.status}) · deneme{" "}
            {job.attemptCount}/{job.maxAttempts}
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
                      <p className="whitespace-pre-wrap text-sm">{summaryView[key] || "—"}</p>
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() =>
                setAccepted((prev) =>
                  Object.fromEntries(Object.keys(prev).map((k) => [k, true])),
                )
              }
            >
              Tümünü seç
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() =>
                setAccepted((prev) =>
                  Object.fromEntries(Object.keys(prev).map((k) => [k, false])),
                )
              }
            >
              Seçimi temizle
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || acceptedCount === 0}
              onClick={() => void applySelected()}
            >
              Seçilenleri özel taslağa uygula
              {acceptedCount ? ` (${acceptedCount})` : ""}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
