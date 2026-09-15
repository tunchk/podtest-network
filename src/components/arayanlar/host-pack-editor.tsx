"use client";

import { useState } from "react";
import type { HostPack } from "@/lib/arayanlar/artifact-schema";

export function HostPackEditor(props: {
  applicationId: string;
  initial: HostPack;
  hasHostEdits: boolean;
}) {
  const [pack, setPack] = useState(props.initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/sunucu/basvurular/${props.applicationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_edits", edits: pack }),
    });
    setBusy(false);
    setMessage(res.ok ? "Düzenlemeler kaydedildi." : "Kayıt başarısız");
  }

  async function regen() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/sunucu/basvurular/${props.applicationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "regen" }),
    });
    const data = await res.json();
    setBusy(false);
    setMessage(
      res.ok
        ? `Yeniden üretim kuyruğa alındı (${data.jobId}). Konuk kredisi kullanılmaz.`
        : data.error ?? "Hata",
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          Sunucu düzenlemelerini kaydet
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void regen()}>
          Paketi yeniden üret (platform kotası)
        </button>
        {props.hasHostEdits ? (
          <span className="self-center text-xs text-[var(--muted)]">Kayıtlı sunucu düzenlemesi var</span>
        ) : null}
      </div>
      {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}

      <article className="panel space-y-4 text-sm leading-relaxed">
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Olgusal giriş</h2>
          <textarea
            className="mt-2 w-full rounded-md border border-[var(--line)] bg-transparent p-3"
            rows={4}
            value={pack.factualIntroduction.text}
            onChange={(e) =>
              setPack({
                ...pack,
                factualIntroduction: { ...pack.factualIntroduction, text: e.target.value },
              })
            }
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Kaynak: {pack.factualIntroduction.sourceLabels.join(", ")} · belirsiz:{" "}
            {pack.factualIntroduction.uncertaintyLabels.join(", ") || "—"}
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Ana sorular</h2>
          <ul className="mt-2 space-y-3">
            {pack.mainQuestions.map((q, i) => (
              <li key={i}>
                <input
                  className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
                  value={q.question}
                  onChange={(e) => {
                    const mainQuestions = [...pack.mainQuestions];
                    mainQuestions[i] = { ...q, question: e.target.value };
                    setPack({ ...pack, mainQuestions });
                  }}
                />
                {q.followUps.length ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">Takip: {q.followUps.join(" · ")}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Vaka</h2>
          <p className="mt-2 font-medium">{pack.case.title}</p>
          <p className="mt-1">{pack.case.setup}</p>
          <ul className="mt-2 list-disc pl-5 text-[var(--muted)]">
            <li>Destek 1: {pack.case.supportingFacts[0]}</li>
            <li>Destek 2: {pack.case.supportingFacts[1]}</li>
            <li>Yeni olgu: {pack.case.newFact}</li>
          </ul>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Hızlı tur</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {pack.rapidRound.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Alternatifler: {pack.rapidRound.alternatives.join(" · ")}
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Zamanlama</h2>
          <ul className="mt-2 space-y-1 text-[var(--muted)]">
            {pack.timingAndTransitions.map((t) => (
              <li key={t.start}>
                {t.start}–{t.end} {t.label}: {t.hostNote}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Sınırlar ve iletişim</h2>
          <p className="mt-2">Hariç: {pack.excludedTopics.join(", ") || "—"}</p>
          <p>Kanal: {pack.approvedContactChannel}</p>
          <p className="mt-2 text-xs">{pack.coldOpenProductionNote}</p>
        </section>
      </article>
    </div>
  );
}
