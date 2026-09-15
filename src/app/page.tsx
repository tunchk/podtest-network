import Link from "next/link";
import { ui } from "@/lib/ui-copy";

export default function HomePage() {
  return (
    <section className="grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-center">
      <div>
        <p className="mb-3 text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Topluluk</p>
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
            İsteğe bağlı{" "}
            <Link href="/arayanlar" className="text-[var(--accent)]">
              PodTest Arayanlar
            </Link>{" "}
            hazırlığı — üyelik için zorunlu değil.
          </li>
          <li>İş arama / işe alma durumları yetki vermez; sadece senin işaretlerin.</li>
        </ul>
      </aside>
    </section>
  );
}
