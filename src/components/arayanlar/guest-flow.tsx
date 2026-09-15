"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { DraftAnswers, SubmittedFacts } from "@/lib/arayanlar/constants";

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
};

type Quote = {
  cost: number;
  sponsoredAmount: number;
  available: number;
  grantAlreadyIssued: boolean;
  canAffordAfterGrant: boolean;
  note: string;
  currencyLabel: string;
};

export function ArayanlarGuestFlow() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [app, setApp] = useState<AppView | null>(null);
  const [facts, setFacts] = useState<SubmittedFacts | null>(null);
  const [guestBrief, setGuestBrief] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summaryMode, setSummaryMode] = useState(false);
  const [summary, setSummary] = useState<DraftAnswers>({});

  const refresh = useCallback(async () => {
    const [basvuru, gonder] = await Promise.all([
      fetch("/api/arayanlar/basvuru").then((r) => r.json()),
      fetch("/api/arayanlar/gonder").then((r) => r.json()),
    ]);
    setQuote(basvuru.quote);
    setApp(basvuru.application ?? gonder.application);
    setFacts(gonder.factsPreview);
    setGuestBrief(gonder.guestBrief?.brief ?? null);
    if (gonder.application?.draftAnswers) {
      setSummary(gonder.application.draftAnswers);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function confirmCost() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/arayanlar/basvuru", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm_cost" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Hata");
      return;
    }
    setQuote(data.quote);
    setApp(data.application);
  }

  async function send(skip = false) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/arayanlar/sohbet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, skip }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.application) setApp(data.application);
    if (!res.ok) {
      setError(data.error ?? "Sohbet hatası — önceki cevapların korundu.");
      return;
    }
    setMessage("");
    await refresh();
  }

  async function useSummary() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/arayanlar/sohbet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summaryFallback: true, answers: summary }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.application) setApp(data.application);
    await refresh();
  }

  async function submit() {
    if (!facts) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/arayanlar/gonder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", facts }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Gönderilemedi");
      return;
    }
    setApp(data.application);
    await refresh();
  }

  async function withdraw() {
    setBusy(true);
    const res = await fetch("/api/arayanlar/gonder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.application) setApp(data.application);
  }

  if (!app || !quote) {
    return <p className="text-sm text-[var(--muted)]">Yükleniyor…</p>;
  }

  if (app.status === "WITHDRAWN") {
    return (
      <div className="panel space-y-4">
        <p>Başvurun geri çekildi. Daha önce indirilmiş materyaller teknik olarak geri alınamaz.</p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void confirmCost()}>
          Yeniden başla
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!app.confirmedCostAt ? (
        <section className="panel space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Sponsorlu hazırlık</h2>
          <p className="text-sm text-[var(--muted)]">{quote.note}</p>
          <p className="text-sm">
            Maliyet: <strong>{quote.cost}</strong> {quote.currencyLabel ?? "AI kredisi"} · Sponsorluk:{" "}
            {quote.sponsoredAmount} · Mevcut bakiye: {quote.available}
          </p>
          <p className="text-xs text-[var(--muted)]">
            Rezervasyon yalnızca gerçekleri onaylayıp gönderdiğinde başlar; sohbet mesaj başına ücretlendirilmez.
          </p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void confirmCost()}>
            Anladım, hazırlığa başla
          </button>
        </section>
      ) : null}

      {app.confirmedCostAt && (app.status === "DRAFT" || app.status === "AWAITING_CONFIRMATION") ? (
        <section className="panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl">Kısa hazırlık sohbeti</h2>
            <button
              type="button"
              className="text-sm text-[var(--accent)]"
              onClick={() => setSummaryMode((v) => !v)}
            >
              {summaryMode ? "Sohbete dön" : "Özet formu kullan"}
            </button>
          </div>

          {!summaryMode ? (
            <>
              <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border border-[var(--line)] p-3 text-sm">
                {(app.conversationTurns ?? []).map((turn, i) => (
                  <p key={i} className={turn.role === "member" ? "text-[var(--ink)]" : "text-[var(--muted)]"}>
                    <span className="font-medium">{turn.role === "member" ? "Sen: " : "Asistan: "}</span>
                    {turn.content}
                  </p>
                ))}
              </div>
              {app.status === "DRAFT" ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    className="min-w-[16rem] flex-1 rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Kısa cevap…"
                    disabled={busy}
                  />
                  <button type="button" className="btn btn-primary" disabled={busy || !message.trim()} onClick={() => void send(false)}>
                    Gönder
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void send(true)}>
                    Atla
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-2 text-sm">
              {(
                [
                  ["targetRole", "Hedef rol"],
                  ["storyTopic", "Gerçek deneyim / konu"],
                  ["contribution", "Senin katkın"],
                  ["workPreferences", "Çalışma tercihleri"],
                  ["excludedTopics", "Hariç tutulan konular"],
                  ["contactChannel", "Onaylı iletişim"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-[var(--muted)]">{label}</span>
                  <input
                    className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
                    value={summary[key] ?? ""}
                    onChange={(e) => setSummary((s) => ({ ...s, [key]: e.target.value }))}
                  />
                </label>
              ))}
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void useSummary()}>
                Özeti kaydet
              </button>
            </div>
          )}
        </section>
      ) : null}

      {(app.status === "AWAITING_CONFIRMATION" || summaryMode) && facts && app.status !== "SUBMITTED" ? (
        <section className="panel space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Paylaşılacak gerçekler</h2>
          <p className="text-sm text-[var(--muted)]">
            Sunucular yalnızca burada onayladığın alanları görür. Ham CV, özel AI sohbeti ve ilgisiz profil alanları
            varsayılan olarak paylaşılmaz.
          </p>
          <div className="space-y-2 text-sm">
            {(
              [
                ["targetRole", "Hedef rol"],
                ["storyTopic", "Hikâye konusu"],
                ["contribution", "Katkı"],
                ["workPreferences", "Çalışma tercihleri"],
                ["excludedTopics", "Hariç konular"],
                ["contactChannel", "İletişim"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-[var(--muted)]">{label}</span>
                <input
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
                  value={facts[key] ?? ""}
                  onChange={(e) => setFacts({ ...facts, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
            Gerçekleri onayla ve gönder
          </button>
          <p className="text-xs text-[var(--muted)]">
            Gönderim davet veya kesin kayıt tarihi değildir. Bu adım krediyi rezerve eder; her iki hazırlık çıktısı
            hazır olunca düşülür.
          </p>
        </section>
      ) : null}

      {app.status === "SUBMITTED" ? (
        <section className="panel space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Başvuru durumu</h2>
          <p className="text-sm">
            Hazırlık: <strong>{app.prepStatus}</strong>
          </p>
          {app.prepStatus === "READY" && guestBrief ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium">Konuk brifin hazır</p>
              <p>{String(guestBrief.recordingWhatToExpect ?? "")}</p>
              <Link href="/arayanlar/hazirligim" className="btn btn-primary inline-flex">
                Hazırlığımı gör
              </Link>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              İki ayrı paket üretiliyor. Kısmi hata olursa hazırlık tamamlanmış sayılmaz.
            </p>
          )}
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void withdraw()}>
            Başvuruyu geri çek
          </button>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
