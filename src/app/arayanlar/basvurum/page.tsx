import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const statusTr: Record<string, string> = {
  DRAFT: "Taslak",
  AWAITING_CONFIRMATION: "Onay bekliyor",
  SUBMITTED: "Gönderildi",
  WITHDRAWN: "Geri çekildi",
};

const prepTr: Record<string, string> = {
  NOT_STARTED: "Başlamadı",
  QUEUED: "Sırada",
  RUNNING: "Hazırlanıyor",
  READY: "Hazır",
  FAILED: "Başarısız",
  CANCELLED: "İptal",
};

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
          <Link href="/arayanlar" className="text-[var(--accent)] underline">
            Başvuruya başla
          </Link>
        </p>
      ) : (
        <div className="panel space-y-2 text-sm">
          <p>
            Durum: <strong>{statusTr[app.status] ?? app.status}</strong>
          </p>
          <p>
            Hazırlık: <strong>{prepTr[app.prepStatus] ?? app.prepStatus}</strong>
          </p>
          <p className="text-[var(--muted)]">
            Bu başvuru davet veya kesin kayıt tarihi değildir. Geri çekme sonrası sunucu erişimi
            kaldırılır; daha önce indirilmiş dosyalar geri alınamaz.
          </p>
          <Link href="/arayanlar" className="btn btn-primary inline-flex">
            Başvuruya dön
          </Link>
        </div>
      )}
    </section>
  );
}
