import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  mapArayanlarUserFacingState,
  userFacingStateLabel,
} from "@/lib/arayanlar/presentation";

export default async function BasvurumPage() {
  const session = await requireSession();
  const app = await prisma.arayanlarApplication.findUnique({
    where: { userId: session.user.id },
  });

  let prepJob: { attemptCount: number; maxAttempts: number; status: string } | null = null;
  if (app?.prepareJobId) {
    prepJob = await prisma.aiJob.findUnique({
      where: { id: app.prepareJobId },
      select: { attemptCount: true, maxAttempts: true, status: true },
    });
  }

  const facing = app
    ? mapArayanlarUserFacingState({
        status: app.status,
        prepStatus: app.prepStatus,
        prepJob,
      })
    : null;

  return (
    <section className="space-y-6">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Başvurum</h1>
      {!app || !facing ? (
        <p className="text-[var(--muted)]">
          Henüz başvuru yok.{" "}
          <Link href="/arayanlar" className="text-[var(--accent)] underline">
            Başvuruyu başlat
          </Link>
        </p>
      ) : (
        <div className="panel space-y-3 text-sm">
          <p>
            Durum: <strong>{userFacingStateLabel(facing)}</strong>
          </p>
          <p className="text-[var(--muted)]">
            Bu başvuru davet veya kesin kayıt tarihi değildir. Geri çekme sonrası host erişimi
            kaldırılır; daha önce indirilmiş dosyalar geri alınamayabilir.
          </p>
          <div className="flex flex-wrap gap-2">
            {facing === "READY" ? (
              <Link href="/arayanlar/hazirligim" className="btn btn-primary inline-flex">
                Notlarımı aç
              </Link>
            ) : null}
            <Link href="/arayanlar#basvuru" className="btn btn-secondary inline-flex">
              {facing === "DRAFT" || facing === "AWAITING_CONFIRMATION"
                ? "Başvuruma devam et"
                : facing === "QUEUED" ||
                    facing === "RUNNING" ||
                    facing === "SUBMITTED_ACCEPTED" ||
                    facing === "READY"
                  ? "Hazırlık durumunu gör"
                  : "Başvuruya git"}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
