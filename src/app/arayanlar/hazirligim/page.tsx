import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getGuestBriefForMember } from "@/lib/arayanlar/service";
import { RECORDING_FORMAT_STEPS } from "@/lib/arayanlar/artifact-schema";

export default async function HazirligimPage() {
  const session = await requireSession();
  const pack = await getGuestBriefForMember(session.user.id);

  return (
    <section className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Kayıt öncesi notlarım</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Kariyer Portresi için yapımcı araştırma notları. Atanan hosta özel dinleme notları burada
            gösterilmez.
          </p>
        </div>
        <Link href="/arayanlar/basvurum" className="text-sm text-[var(--accent)] print:hidden">
          Başvuruma dön
        </Link>
      </div>

      {!pack ? (
        <p className="panel text-sm text-[var(--muted)]">
          Kayıt öncesi notların henüz hazır değil.{" "}
          <Link href="/arayanlar#basvuru" className="text-[var(--accent)] underline">
            Hazırlık durumunu gör
          </Link>
        </p>
      ) : (
        <article className="panel space-y-5 text-sm leading-relaxed">
          {pack.schemaKind === "legacy" ? (
            <p className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">
              Bu notlar eski formatta. Yeni kanıt-temelli hazırlık için başvurunu güncelleyip yeniden
              üretebilirsin.
            </p>
          ) : null}

          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Kayıt formatı</h2>
            <p className="mt-2 text-[var(--muted)]">{pack.brief.recordingFormatNote}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {RECORDING_FORMAT_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Kimlik sinyalleri</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {pack.brief.identitySignals.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {pack.brief.careerThemes.length ? (
              <p className="mt-2 text-[var(--muted)]">
                Temalar: {pack.brief.careerThemes.join(" · ")}
              </p>
            ) : null}
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Hikâye adayları</h2>
            <div className="mt-3 space-y-4">
              {pack.brief.storyCandidates.map((story) => (
                <div key={story.title} className="rounded-md border border-[var(--line)] p-3">
                  <p className="font-medium">{story.title}</p>
                  <p className="mt-1 text-[var(--muted)]">{story.sourceExperience}</p>
                  <p className="mt-2">{story.whyPrepare}</p>
                  <p className="mt-2 text-xs font-medium">Bildiğimiz</p>
                  <ul className="list-disc pl-5">
                    {story.knownFacts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {story.missingDetails.length ? (
                    <>
                      <p className="mt-2 text-xs font-medium">Eksik detaylar</p>
                      <ul className="list-disc pl-5 text-[var(--muted)]">
                        {story.missingDetails.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <p className="mt-2 text-xs font-medium">Kayıt öncesi düşün</p>
                  <ul className="list-disc pl-5">
                    {story.prepQuestions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Düşünme senaryosu</h2>
            <p className="mt-2">{pack.brief.thinkingScenarioHint}</p>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Ne arıyorsun?</h2>
            {pack.brief.jobSearch.knownPreferences.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {pack.brief.jobSearch.knownPreferences.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[var(--muted)]">Onaylı tercih henüz yok.</p>
            )}
            {pack.brief.jobSearch.missingInformation.length ? (
              <>
                <p className="mt-3 text-xs font-medium">Netleştirmen iyi olur</p>
                <ul className="list-disc space-y-1 pl-5 text-[var(--muted)]">
                  {pack.brief.jobSearch.missingInformation.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {pack.brief.jobSearch.prepQuestions.length ? (
              <>
                <p className="mt-3 text-xs font-medium">Hazırlık soruları</p>
                <ul className="list-disc space-y-1 pl-5">
                  {pack.brief.jobSearch.prepQuestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Hızlı tur (örnek sorular)</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {pack.brief.rapidFireQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Kapanış</h2>
            <p className="mt-2 font-medium">{pack.brief.closing.fixedQuestion}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
              {pack.brief.closing.reflectionPrompts.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>

          {pack.brief.overallMissingInformation.length ? (
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-lg">Genel eksikler</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
                {pack.brief.overallMissingInformation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      )}
    </section>
  );
}
