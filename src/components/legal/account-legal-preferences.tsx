"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LegalCheckbox } from "@/components/legal/legal-checkbox";

type Acceptance = {
  id: string;
  type: string;
  documentType: string;
  documentVersion: string;
  acceptedAt: string;
  withdrawnAt: string | null;
  relatedResourceType: string | null;
  relatedResourceId: string | null;
};

export function AccountLegalPreferences() {
  const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
  const [current, setCurrent] = useState<Record<string, boolean>>({});
  const [marketing, setMarketing] = useState(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/yasal?mine=1");
    if (!res.ok) return;
    const data = await res.json();
    setAcceptances(data.acceptances ?? []);
    setCurrent(data.current ?? {});
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function accept(type: string, documentType: string, scope: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/yasal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          checked: true,
          type,
          documentType,
          scope,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.message ?? data.error ?? "Kayıt başarısız.");
        return;
      }
      setMsg("Kabul kaydedildi.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function withdrawLatest(type: string) {
    const row = acceptances.find((a) => a.type === type && !a.withdrawnAt);
    if (!row) return;
    setBusy(true);
    try {
      await fetch("/api/yasal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw", acceptanceId: row.id }),
      });
      setMsg("Rıza geri alındı (ileriye etkili). Geçmiş kayıt silinmedi.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Zorunlu belgeler</h2>
        <p className="text-sm text-[var(--muted)]">
          Güncel Kullanım Koşulları: {current.TERMS_OF_SERVICE ? "kabul edildi" : "gerekli"}. Güncel
          Aydınlatma: {current.PRIVACY_NOTICE ? "onaylandı" : "gerekli"}.{" "}
          <Link href="/yasal" className="underline">
            Tüm metinler
          </Link>
        </p>
        {!current.TERMS_OF_SERVICE ? (
          <div className="space-y-2">
            <LegalCheckbox
              id="re-terms"
              label="Kullanım Koşulları’nı okudum ve kabul ediyorum."
              href="/yasal/terms_of_service"
              checked={terms}
              onChange={setTerms}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!terms || busy}
              onClick={() => void accept("TERMS", "TERMS_OF_SERVICE", "reacceptance")}
            >
              Koşulları kabul et
            </button>
          </div>
        ) : null}
        {!current.PRIVACY_NOTICE ? (
          <div className="space-y-2">
            <LegalCheckbox
              id="re-privacy"
              label="Aydınlatma Metni’ni okudum."
              href="/yasal/privacy_notice"
              checked={privacy}
              onChange={setPrivacy}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!privacy || busy}
              onClick={() => void accept("PRIVACY_NOTICE", "PRIVACY_NOTICE", "reacceptance")}
            >
              Aydınlatmayı onayla
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Pazarlama (isteğe bağlı)</h2>
        <p className="text-sm text-[var(--muted)]">
          Hizmet/operasyon e-postaları (güvenlik, başvuru durumu, yayın onayı) pazarlama rızasına
          bağlı değildir.
        </p>
        {current.MARKETING_CONSENT ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void withdrawLatest("MARKETING")}
          >
            Pazarlama rızasını geri al
          </button>
        ) : (
          <div className="space-y-2">
            <LegalCheckbox
              id="mkt"
              label="İsteğe bağlı: bülten / tanıtım iletileri almak istiyorum."
              href="/yasal/marketing_consent"
              checked={marketing}
              onChange={setMarketing}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!marketing || busy}
              onClick={() => void accept("MARKETING", "MARKETING_CONSENT", "preferences")}
            >
              Pazarlama rızasını kaydet
            </button>
          </div>
        )}
      </section>

      <section className="panel space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Kabul geçmişi</h2>
        <ul className="space-y-2 text-sm">
          {acceptances.slice(0, 30).map((a) => (
            <li key={a.id} className="rounded border border-[var(--line)] px-3 py-2">
              <span className="font-medium">{a.type}</span> · {a.documentVersion} ·{" "}
              {new Date(a.acceptedAt).toLocaleString("tr-TR")}
              {a.withdrawnAt ? (
                <span className="text-[var(--muted)]">
                  {" "}
                  · geri alındı {new Date(a.withdrawnAt).toLocaleString("tr-TR")}
                </span>
              ) : null}
              {a.relatedResourceId ? (
                <span className="block text-xs text-[var(--muted)]">
                  {a.relatedResourceType}:{a.relatedResourceId}
                </span>
              ) : null}
            </li>
          ))}
          {!acceptances.length ? (
            <li className="text-[var(--muted)]">Henüz kayıt yok (eski hesaplar legacy/unknown).</li>
          ) : null}
        </ul>
      </section>

      {msg ? <p className="text-sm text-[var(--accent-strong)]">{msg}</p> : null}
    </div>
  );
}
