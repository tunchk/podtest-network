"use client";

import { useState } from "react";
import type { HostPack } from "@/lib/arayanlar/artifact-schema";

export function HostPackEditor(props: {
  applicationId: string;
  initial: HostPack;
  hasHostEdits: boolean;
  schemaKind?: "v1" | "legacy";
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
    setMessage(res.ok ? "Düzenlemeler kaydedildi." : "Kayıt başarısız — yeni format gerekli olabilir.");
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
          Sunucu notlarını kaydet
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void regen()}>
          Notları yeniden üret (platform kotası)
        </button>
        {props.hasHostEdits ? (
          <span className="self-center text-xs text-[var(--muted)]">Kayıtlı sunucu düzenlemesi var</span>
        ) : null}
      </div>
      {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}
      {props.schemaKind === "legacy" ? (
        <p className="text-sm text-[var(--muted)]">
          Eski format görüntüleniyor. Yeni kanıt-temelli notlar için yeniden üretim önerilir.
        </p>
      ) : null}

      <article className="panel space-y-4 text-sm leading-relaxed">
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Kayıt formatı</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--muted)]">
            {pack.recordingFormat.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Kimlik / sinyaller</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {pack.identityPrep.profileSignals.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Host soruları: {pack.identityPrep.hostQuestions.join(" · ") || "—"}
          </p>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Hikâye adayları</h2>
          <div className="mt-3 space-y-4">
            {pack.storyCandidates.map((story, i) => (
              <div key={story.title} className="space-y-2 rounded-md border border-[var(--line)] p-3">
                <input
                  className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 font-medium"
                  value={story.title}
                  onChange={(e) => {
                    const storyCandidates = [...pack.storyCandidates];
                    storyCandidates[i] = { ...story, title: e.target.value };
                    setPack({ ...pack, storyCandidates });
                  }}
                />
                <p className="text-[var(--muted)]">{story.sourceExperience}</p>
                <p>{story.whyThisCouldBeAStory}</p>
                <p className="text-xs font-medium">Kaynak</p>
                <p className="text-xs text-[var(--muted)]">{story.sourceReferences.join(" · ")}</p>
                <p className="text-xs font-medium">Eksikler</p>
                <ul className="list-disc pl-5 text-[var(--muted)]">
                  {story.missingDetails.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                <p className="text-xs font-medium">Host soruları</p>
                <ul className="list-disc pl-5">
                  {story.hostQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
                <p className="text-xs font-medium">Takip</p>
                <ul className="list-disc pl-5 text-[var(--muted)]">
                  {story.followUpQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Düşünme senaryosu</h2>
          <textarea
            className="mt-2 w-full rounded-md border border-[var(--line)] bg-transparent p-3"
            rows={4}
            value={pack.thinkingScenario.scenario}
            onChange={(e) =>
              setPack({
                ...pack,
                thinkingScenario: { ...pack.thinkingScenario, scenario: e.target.value },
              })
            }
          />
          <p className="mt-2 text-[var(--muted)]">{pack.thinkingScenario.whyItFitsThisCandidate}</p>
          <p className="mt-2 text-xs font-medium">Dinlenecekler</p>
          <ul className="list-disc pl-5">
            {pack.thinkingScenario.whatTheHostShouldListenFor.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">İş arama</h2>
          <p className="mt-2 text-xs font-medium">Bilinen</p>
          <ul className="list-disc pl-5">
            {pack.jobSearchPrep.knownPreferences.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-medium">Çıkarım (onaysız)</p>
          <ul className="list-disc pl-5 text-[var(--muted)]">
            {pack.jobSearchPrep.inferredButUnconfirmed.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-medium">Eksik</p>
          <ul className="list-disc pl-5 text-[var(--muted)]">
            {pack.jobSearchPrep.missingInformation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Hızlı tur</h2>
          <ul className="mt-2 space-y-2">
            {pack.rapidFire.map((item, i) => (
              <li key={i}>
                <p>{item.question}</p>
                <p className="text-xs text-[var(--muted)]">{item.whyThisQuestionFits}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Kapanış</h2>
          <p className="mt-2 font-medium">{pack.closingPrep.fixedQuestion}</p>
        </section>
      </article>
    </div>
  );
}
