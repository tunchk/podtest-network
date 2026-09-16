"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FaqRow = {
  id: string;
  question: string;
  answer: string;
  status: string;
  currentRevision: number;
  expertApprovedRevision: number | null;
};

export function ExpertFaqPanel({ faqs: initial }: { faqs: FaqRow[] }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    const res = await fetch("/api/uzman", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_faq", question, answer }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Hata");
      return;
    }
    setQuestion("");
    setAnswer("");
    setMsg("Taslak oluşturuldu. Yayımlamak için bu revizyonu onayla.");
    router.refresh();
  }

  async function approve(faq: FaqRow) {
    const res = await fetch("/api/uzman", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve_faq",
        faqId: faq.id,
        revision: faq.currentRevision,
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? `Durum: ${data.faq.status}` : data.error ?? "Hata");
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <h2 className="font-[family-name:var(--font-display)] text-xl">SSS (FAQ)</h2>
      <p className="text-sm text-[var(--muted)]">
        Yönetici taslak önerebilir; yayımlama için atfedilen uzmanın o kesin revizyonu onaylaması
        gerekir. Metin değişince önceki uzman onayı geçersiz olur. Yapay zeka senin adına yanıt
        yayımlamaz.
      </p>
      <div className="space-y-2">
        <input
          className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
          placeholder="Soru"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <textarea
          className="min-h-24 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
          placeholder="Yanıt"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void create()}
          className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
        >
          Taslak ekle
        </button>
      </div>
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
      <ul className="space-y-3">
        {initial.map((f) => (
          <li key={f.id} className="border-b border-[var(--line)] pb-3 text-sm">
            <p className="font-medium">{f.question}</p>
            <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">{f.answer}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Durum: {f.status} · rev {f.currentRevision}
              {f.expertApprovedRevision != null
                ? ` · uzman onayı rev ${f.expertApprovedRevision}`
                : " · uzman onayı yok"}
            </p>
            {f.status !== "PUBLISHED" && f.status !== "REMOVED" ? (
              <button
                type="button"
                className="mt-2 rounded-md bg-[var(--accent)] px-3 py-1.5 text-white"
                onClick={() => void approve(f)}
              >
                Bu revizyonu onayla
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
