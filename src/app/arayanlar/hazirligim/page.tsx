import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getGuestBriefForMember } from "@/lib/arayanlar/service";
import { EDITORIAL_TIMELINE } from "@/lib/arayanlar/constants";

export default async function HazirligimPage() {
  const session = await requireSession();
  const pack = await getGuestBriefForMember(session.user.id);

  return (
    <section className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Kayıt öncesi notlarım</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Kariyer Portresi kaydın için hazırlanan notlar. Atanan hosta özel notlar burada
            gösterilmez. Yazdırma için tarayıcının yazdır komutunu kullanabilirsin.
          </p>
        </div>
        <Link href="/arayanlar" className="text-sm text-[var(--accent)] print:hidden">
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
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Kayıt nasıl geçecek?</h2>
            <p className="mt-2">{pack.brief.recordingWhatToExpect}</p>
          </section>
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Seçilen gerçek konu</h2>
            <p className="mt-2">{pack.brief.selectedStoryTopic}</p>
          </section>
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Hazırlık rehberi</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {pack.brief.preparationGuidance.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Hedef rol ve iletişim</h2>
            <p className="mt-2">{pack.brief.confirmedTargetRole}</p>
            <p className="mt-1">{pack.brief.contactPreferences}</p>
          </section>
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Kontrol listesi</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {pack.brief.recordingChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Zaman çizelgesi (bilgi)</h2>
            <ul className="mt-2 space-y-1 text-[var(--muted)]">
              {EDITORIAL_TIMELINE.map((s) => (
                <li key={s.start}>
                  {s.start}–{s.end} · {s.label}
                </li>
              ))}
            </ul>
            <p className="mt-2">{pack.brief.timelineOverview}</p>
          </section>
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Soğuk açılış notu</h2>
            <p className="mt-2">{pack.brief.coldOpenNote}</p>
          </section>
          <p className="rounded-md bg-[color-mix(in_oklab,var(--accent)_8%,transparent)] p-3 text-xs">
            {pack.brief.disclaimer}
          </p>
        </article>
      )}
    </section>
  );
}
