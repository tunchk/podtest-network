import Link from "next/link";
import { requireSession } from "@/lib/session";
import { ArayanlarGuestFlow } from "@/components/arayanlar/guest-flow";

export default async function ArayanlarPage() {
  await requireSession();

  return (
    <section className="space-y-6">
      <div>
        <p className="mb-2 text-sm uppercase tracking-[0.18em] text-[var(--muted)]">İsteğe bağlı</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
          PodTest Arayanlar
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Katılım tamamen gönüllüdür. Üyelik ve günlük platform kullanımı Arayanlar başvurusu gerektirmez. CV veya
          tamamlanmış genel profil olmadan da başvurabilirsin.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/arayanlar/basvurum" className="text-[var(--accent)] hover:underline">
            Başvurum
          </Link>
          <Link href="/arayanlar/hazirligim" className="text-[var(--accent)] hover:underline">
            Hazırlığım
          </Link>
        </div>
      </div>
      <ArayanlarGuestFlow />
    </section>
  );
}
