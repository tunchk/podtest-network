"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import type { DraftAnswers, SubmittedFacts } from "@/lib/arayanlar/constants";
import { LegalCheckbox } from "@/components/legal/legal-checkbox";
import { ArayanlarFlowStepper } from "@/components/arayanlar/flow-stepper";
import {
  isPrepWaiting,
  mapArayanlarUserFacingState,
  resolveFlowStep,
  shouldPollPrep,
  userFacingStateLabel,
  type PrepJobMeta,
} from "@/lib/arayanlar/presentation";

type AppView = {
  id: string;
  status: string;
  prepStatus: string;
  draftAnswers: DraftAnswers;
  conversationTurns: Array<{ role: string; content: string; skipped?: boolean }>;
  questionsAsked: number;
  submittedFacts: SubmittedFacts | null;
  confirmedCostAt: string | null;
  withdrawnAt: string | null;
  prepareJobId?: string | null;
};

type Quote = {
  cost: number;
  sponsoredAmount: number;
  available: number;
  grantAlreadyIssued: boolean;
  canAffordAfterGrant: boolean;
  note: string;
  currencyLabel: string;
  unlimitedInternal?: boolean;
};

const FACT_FIELDS = [
  ["targetRole", "Hedef rol"],
  ["storyTopic", "Hikâye konusu"],
  ["contribution", "Katkı"],
  ["workPreferences", "Çalışma tercihleri"],
  ["excludedTopics", "Hariç konular"],
  ["contactChannel", "İletişim"],
] as const;

const SUMMARY_FIELDS = [
  ["targetRole", "Hedef rol"],
  ["storyTopic", "Gerçek deneyim / konu"],
  ["contribution", "Senin katkın"],
  ["workPreferences", "Çalışma tercihleri"],
  ["excludedTopics", "Hariç tutulan konular"],
  ["contactChannel", "Onaylı iletişim"],
] as const;

const POLL_MS = 4000;

function ConversationBubbles({
  turns,
  endRef,
}: {
  turns: AppView["conversationTurns"];
  endRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Hazırlık sohbeti"
      className="max-h-[min(24rem,50vh)] space-y-3 overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--surface)] p-3"
    >
      {turns.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Henüz mesaj yok.</p>
      ) : (
        turns.map((turn, i) => {
          const isGuest = turn.role === "member";
          const label = isGuest ? "Sen" : "Asistan";
          return (
            <div
              key={i}
              role="article"
              aria-label={label}
              className={`flex ${isGuest ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  isGuest
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
                    : "max-w-[85%] rounded-2xl rounded-bl-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)]"
                }
              >
                <p
                  className={`mb-1 text-xs font-semibold ${isGuest ? "text-white/80" : "text-[var(--muted)]"}`}
                >
                  {label}
                  {turn.skipped ? " · atlandı" : ""}
                </p>
                <p className="whitespace-pre-wrap">{turn.content}</p>
              </div>
            </div>
          );
        })
      )}
      <div ref={endRef} />
    </div>
  );
}

function PrepWaitingPanel({ onCheckNow, checking }: { onCheckNow: () => void; checking: boolean }) {
  return (
    <div className="space-y-4" aria-live="polite">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl">Hazırlığını oluşturuyoruz</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          CV’ni ve onayladığın bilgileri kullanarak kayıt öncesi hazırlığını çıkarıyoruz.
        </p>
      </div>
      <p className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm">
        Bu sayfada beklemek zorunda değilsin. Hazırlık arka planda devam eder. Sayfayı kapatabilir
        veya başka bir yere geçebilirsin. Kayıt öncesi notların hazır olduğunda Bildirimler’de haber
        vereceğiz.
      </p>
      <ol className="space-y-2 text-sm">
        <li>✓ Bilgilerin alındı</li>
        <li>
          <span className="text-[var(--accent)]">●</span> Hazırlık oluşturuluyor
        </li>
        <li className="text-[var(--muted)]">○ Kayıt rehberi hazır</li>
      </ol>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={checking}
        onClick={onCheckNow}
        aria-label="Şimdi kontrol et"
      >
        {checking ? "Kontrol ediliyor…" : "Şimdi kontrol et"}
      </button>
    </div>
  );
}

export function ArayanlarGuestFlow({ startFromCv = false }: { startFromCv?: boolean }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [app, setApp] = useState<AppView | null>(null);
  const [facts, setFacts] = useState<SubmittedFacts | null>(null);
  const [guestBrief, setGuestBrief] = useState<Record<string, unknown> | null>(null);
  const [prepJob, setPrepJob] = useState<PrepJobMeta>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hostPrepShareOk, setHostPrepShareOk] = useState(false);
  const [summaryMode, setSummaryMode] = useState(false);
  const [summary, setSummary] = useState<DraftAnswers>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [cvDocs, setCvDocs] = useState<
    Array<{ id: string; originalFilename: string; extractionStatus: string }>
  >([]);
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);
  const [cvNote, setCvNote] = useState<string | null>(null);
  const [cvEntryArmed, setCvEntryArmed] = useState(startFromCv);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoCvStarted = useRef(false);
  const pollBusy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [basvuru, gonder, cvRes] = await Promise.all([
        fetch("/api/arayanlar/basvuru").then((r) => r.json()),
        fetch("/api/arayanlar/gonder").then((r) => r.json()),
        fetch("/api/cv").then((r) => (r.ok ? r.json() : { documents: [] })),
      ]);
      setQuote(basvuru.quote);
      setApp(basvuru.application ?? gonder.application);
      setFacts(gonder.factsPreview);
      setGuestBrief(gonder.guestBrief?.brief ?? null);
      setPrepJob(gonder.prepJob ?? null);
      if (gonder.application?.draftAnswers) {
        setSummary(gonder.application.draftAnswers);
      }
      const okDocs = (cvRes.documents ?? []).filter(
        (d: { extractionStatus: string }) => d.extractionStatus === "OK",
      );
      setCvDocs(okDocs);
      setSelectedCvId((prev) => prev ?? okDocs[0]?.id ?? null);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [app?.conversationTurns?.length, summaryMode]);

  // Safe read-only polling while preparation is in progress.
  useEffect(() => {
    if (!app) return;
    const state = mapArayanlarUserFacingState({
      status: app.status,
      prepStatus: app.prepStatus,
      prepJob,
    });
    if (!shouldPollPrep(state)) return;

    const id = window.setInterval(() => {
      if (pollBusy.current || document.visibilityState === "hidden") return;
      pollBusy.current = true;
      void refresh().finally(() => {
        pollBusy.current = false;
      });
    }, POLL_MS);

    return () => window.clearInterval(id);
  }, [app, prepJob, refresh]);

  async function confirmCost() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/arayanlar/basvuru", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_cost" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Hata");
        return;
      }
      setQuote(data.quote);
      setApp(data.application);
    } finally {
      setBusy(false);
    }
  }

  async function send(skip = false) {
    if (busy) return;
    if (!skip && !message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/arayanlar/sohbet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, skip }),
      });
      const data = await res.json();
      if (data.application) setApp(data.application);
      if (!res.ok) {
        setError(data.error ?? "Sohbet hatası — önceki cevapların korundu.");
        return;
      }
      setMessage("");
      await refresh();
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function useSummary() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/arayanlar/sohbet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryFallback: true, answers: summary }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Özet kaydedilemedi — önceki cevapların korundu.");
        if (data.application) setApp(data.application);
        return;
      }
      if (data.application) setApp(data.application);
      setSummaryMode(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function useExistingCv(cvIdOverride?: string) {
    const cvDocumentId = cvIdOverride ?? selectedCvId;
    if (busy || !cvDocumentId) return;
    setBusy(true);
    setError(null);
    setCvNote(null);
    try {
      const res = await fetch("/api/arayanlar/cv-onerileri", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvDocumentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? data.error ?? "CV önerileri uygulanamadı.");
        return;
      }
      if (data.application) setApp(data.application);
      if (data.factsPreview) setFacts(data.factsPreview);
      if (data.application?.draftAnswers) setSummary(data.application.draftAnswers);
      setCvNote(
        Array.isArray(data.notes) && data.notes.length
          ? data.notes.join(" ")
          : "CV önerileri dolduruldu. Onay adımında düzenleyebilirsin.",
      );
      setSummaryMode(false);
      setCvEntryArmed(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!cvEntryArmed || autoCvStarted.current || busy || !selectedCvId) return;
    if (app && (app.status === "SUBMITTED" || app.status === "WITHDRAWN")) return;
    autoCvStarted.current = true;
    void useExistingCv(selectedCvId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot entry from ?kaynak=cv
  }, [cvEntryArmed, selectedCvId, app?.status, busy]);

  async function submit() {
    if (!facts || busy || !app) return;
    if (!hostPrepShareOk) {
      setError("Sunucu hazırlık paylaşımı bilgilendirmesini onaylamadan gönderemezsin.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const legal = await fetch("/api/yasal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          checked: true,
          type: "HOST_PREP_SHARING",
          documentType: "HOST_PREP_SHARING_NOTICE",
          scope: "arayanlar_submit",
          relatedResourceType: "arayanlar_application",
          relatedResourceId: app.id,
        }),
      });
      if (!legal.ok) {
        const data = await legal.json();
        setError(data.message ?? data.error ?? "Sunucu paylaşım onayı kaydedilemedi.");
        return;
      }
      const res = await fetch("/api/arayanlar/gonder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", facts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "INSUFFICIENT_CREDITS"
            ? "Yetersiz kredi. Özetin korundu; hazırlık başlatılmadı."
            : data.error === "LEGAL_HOST_PREP_REQUIRED"
              ? "Sunucu hazırlık paylaşımı onayı gerekli."
              : (data.error ?? "Gönderilemedi"),
        );
        return;
      }
      setApp(data.application);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function retryPrep() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/arayanlar/gonder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_prep" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "NOT_RETRYABLE" || data.error === "Max attempts"
            ? "Bu hazırlık için yeniden deneme artık mümkün değil."
            : (data.error ?? "Yeniden denenemedi"),
        );
        return;
      }
      if (data.application) setApp(data.application);
      if (data.prepJob) setPrepJob(data.prepJob);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/arayanlar/gonder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Geri çekilemedi");
        return;
      }
      if (data.application) setApp(data.application);
      setWithdrawOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function returnToFacts() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/arayanlar/gonder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revise" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Bilgilere dönülemedi");
        return;
      }
      if (data.application) setApp(data.application);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loadFailed) {
    return (
      <div className="panel space-y-3">
        <p className="text-sm text-red-700">Başvuru yüklenemedi.</p>
        <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
          Şimdi kontrol et
        </button>
      </div>
    );
  }

  if (!app || !quote) {
    return <p className="text-sm text-[var(--muted)]">Yükleniyor…</p>;
  }

  const facing = mapArayanlarUserFacingState({
    status: app.status,
    prepStatus: app.prepStatus,
    prepJob,
  });
  const flowStep = resolveFlowStep({
    status: app.status,
    prepStatus: app.prepStatus,
    confirmedCostAt: app.confirmedCostAt,
  });
  const turns = app.conversationTurns ?? [];
  const showKontrol = app.status === "AWAITING_CONFIRMATION";
  const showHazirlik = app.status === "SUBMITTED";

  if (app.status === "WITHDRAWN") {
    return (
      <div className="space-y-6">
        <ArayanlarFlowStepper current="tanisalim" />
        <section className="panel space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            {userFacingStateLabel("WITHDRAWN")}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Başvurun aktif süreçten çıkarıldı. Devam eden hazırlık varsa durduruldu; atanan host
            erişimi kaldırıldı. Daha önce indirilmiş kopyalar teknik olarak geri alınamayabilir.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void confirmCost()}
          >
            {busy ? "Başlatılıyor…" : "Yeniden başla"}
          </button>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ArayanlarFlowStepper current={flowStep} />

      {app.status === "DRAFT" ? (
        <section className="panel space-y-4" aria-labelledby="stage-tanisalim">
          <h2 id="stage-tanisalim" className="font-[family-name:var(--font-display)] text-xl">
            Tanışalım
          </h2>

          {!app.confirmedCostAt ? (
            <>
              <p className="text-sm text-[var(--muted)]">
                Kısa bir hazırlık sohbeti veya düzenlenebilir özet ile devam edebilirsin. Kredi
                yalnızca bilgilerini onaylayıp hazırlığı başlattığında kullanılır. CV zorunlu
                değildir.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void confirmCost()}
                >
                  {busy ? "Başlatılıyor…" : "Başvuruyu başlat"}
                </button>
                {cvDocs.length ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || !selectedCvId}
                    onClick={() => void useExistingCv()}
                  >
                    {busy ? "Dolduruluyor…" : "CV'mden bölüm hazırlığına başla"}
                  </button>
                ) : null}
              </div>
              {cvDocs.length ? (
                <div className="space-y-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm">
                  <label className="block">
                    <span className="text-[var(--muted)]">CV</span>
                    <select
                      className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
                      value={selectedCvId ?? ""}
                      onChange={(e) => setSelectedCvId(e.target.value || null)}
                      disabled={busy}
                    >
                      {cvDocs.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.originalFilename}
                        </option>
                      ))}
                    </select>
                  </label>
                  {cvNote ? <p className="text-[var(--muted)]">{cvNote}</p> : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)]">
                İsteğe bağlı sorular atlanabilir. Sohbet zorunlu değil; özet yolu da yeterli.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-sm text-[var(--accent)] underline"
                  disabled={busy}
                  onClick={() => setSummaryMode((v) => !v)}
                >
                  {summaryMode ? "Sohbete dön" : "Özet formu kullan"}
                </button>
              </div>

              {cvDocs.length ? (
                <div className="space-y-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm">
                  <p className="font-medium">CV’mden bölüm hazırlığına başla</p>
                  <p className="text-[var(--muted)]">
                    Düzenlenebilir öneriler üretilir. Onaylamadan hiçbir şey paylaşılmaz; ekstra AI
                    kredisi alınmaz.
                  </p>
                  <label className="block">
                    <span className="text-[var(--muted)]">CV</span>
                    <select
                      className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
                      value={selectedCvId ?? ""}
                      onChange={(e) => setSelectedCvId(e.target.value || null)}
                      disabled={busy}
                    >
                      {cvDocs.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.originalFilename}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || !selectedCvId}
                    onClick={() => void useExistingCv()}
                  >
                    {busy ? "Dolduruluyor…" : "CV'mden bölüm hazırlığına başla"}
                  </button>
                  {cvNote ? <p className="text-[var(--muted)]">{cvNote}</p> : null}
                </div>
              ) : null}

              {!summaryMode ? (
                <>
                  <ConversationBubbles turns={turns} endRef={chatEndRef} />
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <input
                      ref={inputRef}
                      className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send(false);
                        }
                      }}
                      placeholder="Kısa cevap…"
                      disabled={busy}
                      aria-label="Yanıtın"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy || !message.trim()}
                        onClick={() => void send(false)}
                      >
                        {busy ? "Gönderiliyor…" : "Yanıtı gönder"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => void send(true)}
                      >
                        Atla
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="text-[var(--muted)]">
                    Alanları düzenleyip kaydet; sohbet gerekmez. Sonraki adımda onaylarsın.
                  </p>
                  {SUMMARY_FIELDS.map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-[var(--muted)]">{label}</span>
                      <input
                        className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
                        value={summary[key] ?? ""}
                        onChange={(e) => setSummary((s) => ({ ...s, [key]: e.target.value }))}
                        disabled={busy}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void useSummary()}
                  >
                    {busy ? "Kaydediliyor…" : "Bilgilerimi kontrol et"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {showKontrol ? (
        <section className="panel space-y-4" aria-labelledby="stage-kontrol">
          <h2 id="stage-kontrol" className="font-[family-name:var(--font-display)] text-xl">
            Bilgilerini kontrol et
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Atanan host yalnızca burada onayladığın alanları görür. Ham CV ve sohbet varsayılan
            olarak paylaşılmaz.
          </p>

          {facts ? (
            <div className="space-y-2 text-sm">
              {FACT_FIELDS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-[var(--muted)]">{label}</span>
                  <input
                    className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
                    value={facts[key] ?? ""}
                    onChange={(e) => setFacts({ ...facts, [key]: e.target.value })}
                    disabled={busy}
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Özet yükleniyor…</p>
          )}

          {!quote.unlimitedInternal ? (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm">
              <p className="font-medium">Hazırlık maliyeti</p>
              {quote.grantAlreadyIssued || quote.sponsoredAmount > 0 ? (
                <p className="mt-1 text-[var(--muted)]">
                  Bu hazırlık sponsorlu olarak oluşturulabilir ({quote.cost}{" "}
                  {quote.currencyLabel}).
                </p>
              ) : (
                <p className="mt-1 text-[var(--muted)]">
                  Bu hazırlık için {quote.cost} {quote.currencyLabel} kullanılır.
                </p>
              )}
              {!quote.canAffordAfterGrant ? (
                <p className="mt-2 text-sm text-red-700">
                  Bakiye yetersiz görünüyor. Onay başarısız olursa özetin korunur.
                </p>
              ) : null}
            </div>
          ) : null}

          <fieldset className="space-y-2 rounded-md border border-[var(--line)] p-3 text-sm">
            <legend className="px-1 font-medium">Sunucu paylaşımı</legend>
            <p className="text-[var(--muted)]">
              Atanan host ham CV dosyanı görmez; yalnızca onayladığın gerçekler ve türetilmiş
              hazırlık notlarını görür.
            </p>
            <LegalCheckbox
              id="host-prep-share"
              label="Atanan sunucuya türetilmiş hazırlık notlarının gösterilebileceğini anlıyorum."
              href="/yasal/host_prep_sharing_notice"
              checked={hostPrepShareOk}
              onChange={setHostPrepShareOk}
              required
            />
          </fieldset>

          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !facts || !hostPrepShareOk || !quote.canAffordAfterGrant}
            onClick={() => void submit()}
            title={
              !hostPrepShareOk
                ? "Önce sunucu paylaşım bilgilendirmesini onayla"
                : !quote.canAffordAfterGrant
                  ? "Yetersiz kredi"
                  : undefined
            }
          >
            {busy ? "Başlatılıyor…" : "Bilgilerimi onayla ve hazırlığı başlat"}
          </button>
          <p className="text-xs text-[var(--muted)]">
            Bu adım davet veya kesin kayıt tarihi değildir. Onaydan önce alanları düzenleyebilirsin.
          </p>
        </section>
      ) : null}

      {showHazirlik ? (
        <section className="panel space-y-4" aria-labelledby="stage-hazirlik">
          {isPrepWaiting(facing) ? (
            <PrepWaitingPanel
              checking={busy}
              onCheckNow={() => {
                setBusy(true);
                void refresh().finally(() => setBusy(false));
              }}
            />
          ) : null}

          {facing === "READY" ? (
            <div className="space-y-3" aria-live="polite">
              <h2 id="stage-hazirlik" className="font-[family-name:var(--font-display)] text-xl">
                Kayıt öncesi notların hazır
              </h2>
              <p className="text-sm text-[var(--muted)]">
                CV’nden ve onayladığın bilgilerden kayıt öncesi notların oluşturuldu.
              </p>
              {!quote.unlimitedInternal ? (
                <p className="text-sm text-[var(--muted)]">
                  {quote.sponsoredAmount > 0
                    ? "Bu hazırlık sponsorlu olarak oluşturuldu."
                    : "Bu hazırlık için 1 AI kredisi kullanıldı."}
                </p>
              ) : null}
              <p className="text-sm text-[var(--muted)]">
                Atanan host da kayıt için gerekli hazırlık notlarını görebilecek.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/arayanlar/hazirligim" className="btn btn-primary inline-flex">
                  Notlarımı aç
                </Link>
                <Link href="/arayanlar/basvurum" className="btn btn-ghost inline-flex">
                  Başvuruma dön
                </Link>
              </div>
            </div>
          ) : null}

          {facing === "FAILED_RETRYABLE" ? (
            <div className="space-y-3" aria-live="polite">
              <h2 className="font-[family-name:var(--font-display)] text-xl">
                Hazırlık tamamlanamadı
              </h2>
              <p className="text-sm text-[var(--muted)]">
                Bilgilerin ve başvurun güvende. Teknik bir sorun nedeniyle hazırlığı tamamlayamadık.
              </p>
              <p className="text-sm text-[var(--muted)]">
                Teknik yeniden deneme ek kredi kullanmaz.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void retryPrep()}
                >
                  {busy ? "Yeniden deneniyor…" : "Ücretsiz yeniden dene"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => void returnToFacts()}
                >
                  Bilgilerime dön
                </button>
              </div>
            </div>
          ) : null}

          {facing === "FAILED_TERMINAL" ? (
            <div className="space-y-3" aria-live="polite">
              <h2 className="font-[family-name:var(--font-display)] text-xl">
                Hazırlığı şu anda tamamlayamadık
              </h2>
              <p className="text-sm text-[var(--muted)]">
                Bilgilerin güvende. Bu deneme için yeniden deneme hakkı kalmadı. Bilgilerine dönüp
                yeniden gönderebilir veya başvurunu geri çekebilirsin.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void returnToFacts()}
                >
                  Bilgilerime dön
                </button>
                <Link href="/arayanlar/basvurum" className="btn btn-ghost inline-flex">
                  Başvuruma dön
                </Link>
              </div>
            </div>
          ) : null}

          {!withdrawOpen ? (
            <button
              type="button"
              className="btn btn-ghost text-[var(--danger)]"
              disabled={busy}
              onClick={() => setWithdrawOpen(true)}
            >
              Başvuruyu geri çek
            </button>
          ) : (
            <div
              role="dialog"
              aria-labelledby="withdraw-title"
              className="space-y-3 rounded-md border border-[var(--danger)]/40 bg-[var(--surface)] p-4"
            >
              <h3 id="withdraw-title" className="font-medium">
                Başvurunu geri çekmek istiyor musun?
              </h3>
              <p className="text-sm text-[var(--muted)]">
                Başvurun aktif süreçten çıkarılır. Devam eden hazırlık varsa durdurulur ve host ile
                paylaşılmaz. Girdiğin taslak bilgiler yeniden başladığında kullanılabilir; daha
                önce oluşturulmuş hazırlık host erişiminden kaldırılır. Rezerve edilmiş kredi varsa
                mevcut kurallara göre serbest bırakılır — ek iade vaadi yoktur.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary bg-[var(--danger)]"
                  disabled={busy}
                  onClick={() => void withdraw()}
                >
                  {busy ? "Geri çekiliyor…" : "Başvuruyu geri çek"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setWithdrawOpen(false)}
                >
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
