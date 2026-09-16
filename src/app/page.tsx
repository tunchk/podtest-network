import Link from "next/link";
import { ui } from "@/lib/ui-copy";
import { listLatestPublishedEpisodes } from "@/lib/community/episodes";
import { EpisodeCard } from "@/components/podcast/episode-card";

export default async function HomePage() {
  const latest = await listLatestPublishedEpisodes(6);

  return (
    <div className="space-y-12">
      <section className="grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-center">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--ink)] md:text-5xl">
            {ui.landing.title}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">{ui.landing.lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/kayit" className="btn btn-primary">
              {ui.landing.ctaJoin}
            </Link>
            <Link href="/uyeler" className="btn btn-ghost">
              {ui.landing.ctaBrowse}
            </Link>
            <Link href="/bolumler" className="btn btn-ghost">
              Tüm bölümler
            </Link>
            <Link href="/arayanlar" className="btn btn-ghost">
              {ui.landing.ctaArayanlar}
            </Link>
          </div>
          <p className="mt-6 max-w-xl text-sm text-[var(--muted)]">{ui.landing.laterNote}</p>
        </div>
        <aside className="panel">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Ne var?</h2>
          <ul className="mt-4 space-y-3 text-sm text-[var(--muted)]">
            <li>Hesap oluştur, isteğe bağlı profili doldur veya “Şimdilik geç”.</li>
            <li>Profilini taslak tut, incelemeye gönder, onay sonrası paylaş.</li>
            <li>Üye dizininde yalnızca onaylı ve keşfedilebilir profiller görünür.</li>
            <li>
              Podcast bölümlerini hesap olmadan dinle —{" "}
              <Link href="/bolumler" className="text-[var(--accent)]">
                bölümler
              </Link>
              .
            </li>
            <li>İş arama / işe alma durumları yetki vermez; sadece senin işaretlerin.</li>
          </ul>
        </aside>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">Son bölümler</h2>
          <Link href="/bolumler" className="text-sm underline">
            Tüm bölümler
          </Link>
        </div>
        {latest.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Henüz yayımlanmış bölüm yok.</p>
        ) : (
          <ul className="space-y-4">
            {latest.map((ep) => (
              <li key={ep.id}>
                <EpisodeCard episode={ep} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
