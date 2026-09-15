import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { toGuestApplicationView } from "@/lib/arayanlar/service";

export default async function BasvurumPage() {
  const session = await requireSession();
  const app = await prisma.arayanlarApplication.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <section className="space-y-6">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Başvurum</h1>
      {!app ? (
        <p className="text-[var(--muted)]">
          Henüz başvuru yok.{" "}
          <Link href="/arayanlar" className="text-[var(--accent)]">
            PodTest Arayanlar&apos;a katıl
          </Link>
        </p>
      ) : (
        <div className="panel space-y-2 text-sm">
          <p>
            Durum: <strong>{toGuestApplicationView(app).status}</strong>
          </p>
          <p>
            Hazırlık: <strong>{app.prepStatus}</strong>
          </p>
          <p>
            Gönderim revizyonu: {app.submittedRevision || "—"}
          </p>
          <p className="text-[var(--muted)]">
            Bu başvuru davet veya kesin kayıt tarihi değildir. Geri çekme sonrası sıradan sunucu erişimi kaldırılır;
            daha önce indirilmiş dosyalar geri alınamaz.
          </p>
          <Link href="/arayanlar" className="btn btn-primary inline-flex">
            Başvuruya dön
          </Link>
        </div>
      )}
    </section>
  );
}
