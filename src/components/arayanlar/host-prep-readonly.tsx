import type { HostPack } from "@/lib/arayanlar/artifact-schema";

/** Read-only host producer notes — no CV, no edit/regen controls. */
export function HostPrepReadonly({ pack }: { pack: HostPack }) {
  return (
    <article className="panel space-y-5 text-sm leading-relaxed">
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
        {pack.identityPrep.careerThemes.length ? (
          <p className="mt-2 text-[var(--muted)]">
            Temalar: {pack.identityPrep.careerThemes.join(" · ")}
          </p>
        ) : null}
        {pack.identityPrep.careerTransitions.length ? (
          <p className="mt-1 text-[var(--muted)]">
            Geçişler: {pack.identityPrep.careerTransitions.join(" · ")}
          </p>
        ) : null}
        {pack.identityPrep.confirmedFacts.length ? (
          <>
            <p className="mt-2 text-xs font-medium">Bildiğimiz</p>
            <ul className="list-disc pl-5">
              {pack.identityPrep.confirmedFacts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </>
        ) : null}
        {pack.identityPrep.missingInformation.length ? (
          <>
            <p className="mt-2 text-xs font-medium">Eksikler</p>
            <ul className="list-disc pl-5 text-[var(--muted)]">
              {pack.identityPrep.missingInformation.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="mt-2 text-xs font-medium">Host soruları</p>
        <ul className="list-disc pl-5">
          {pack.identityPrep.hostQuestions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg">Hikâye adayları</h2>
        <div className="mt-3 space-y-4">
          {pack.storyCandidates.map((story) => (
            <div key={story.title} className="space-y-2 rounded-md border border-[var(--line)] p-3">
              <p className="font-medium">{story.title}</p>
              <p className="text-[var(--muted)]">{story.sourceExperience}</p>
              <p>{story.whyThisCouldBeAStory}</p>
              <p className="text-xs font-medium">Bildiğimiz</p>
              <ul className="list-disc pl-5">
                {story.knownFacts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {story.missingDetails.length ? (
                <>
                  <p className="text-xs font-medium">Eksikler</p>
                  <ul className="list-disc pl-5 text-[var(--muted)]">
                    {story.missingDetails.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p className="text-xs font-medium">Host soruları</p>
              <ul className="list-disc pl-5">
                {story.hostQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              {story.followUpQuestions.length ? (
                <>
                  <p className="text-xs font-medium">Takip</p>
                  <ul className="list-disc pl-5 text-[var(--muted)]">
                    {story.followUpQuestions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg">Düşünme senaryosu</h2>
        <p className="mt-2 whitespace-pre-wrap">{pack.thinkingScenario.scenario}</p>
        <p className="mt-2 text-[var(--muted)]">{pack.thinkingScenario.whyItFitsThisCandidate}</p>
        <p className="mt-2 text-xs font-medium">Dinlenecekler</p>
        <ul className="list-disc pl-5">
          {pack.thinkingScenario.whatTheHostShouldListenFor.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {pack.thinkingScenario.constraints.length ? (
          <>
            <p className="mt-2 text-xs font-medium">Kısıtlar</p>
            <ul className="list-disc pl-5 text-[var(--muted)]">
              {pack.thinkingScenario.constraints.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </>
        ) : null}
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
        <p className="mt-2 text-xs font-medium">Eksik / netleştir</p>
        <ul className="list-disc pl-5 text-[var(--muted)]">
          {pack.jobSearchPrep.missingInformation.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {pack.jobSearchPrep.hostQuestions.length ? (
          <>
            <p className="mt-2 text-xs font-medium">Host soruları</p>
            <ul className="list-disc pl-5">
              {pack.jobSearchPrep.hostQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-lg">Hızlı tur</h2>
        <ul className="mt-2 space-y-2">
          {pack.rapidFire.map((item) => (
            <li key={item.question}>
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
  );
}
