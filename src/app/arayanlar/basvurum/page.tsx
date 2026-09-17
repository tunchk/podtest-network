import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  mapArayanlarUserFacingState,
  userFacingStateLabel,
} from "@/lib/arayanlar/presentation";
import { toRecordingScheduleView } from "@/lib/arayanlar/recording-schedule";
import { CandidateRecordingSchedule } from "@/components/arayanlar/candidate-recording-schedule";
import { CandidatePublicationPanel } from "@/components/arayanlar/candidate-publication-panel";
import { getKariyerPublicationCandidateState } from "@/lib/arayanlar/publication";

function primaryStatusLabel(
  publication: Awaited<ReturnType<typeof getKariyerPublicationCandidateState>>,
  facing: ReturnType<typeof mapArayanlarUserFacingState>,
) {
  if (publication.kind === "published") return "Kariyer Portresi yayında";
  if (publication.kind === "change_requested") return "Değişiklik talebin iletildi";
  if (publication.kind === "approval_requested") {
    return publication.alreadyApproved
      ? "Yayın onayın alındı — ekip yayına alacak"
      : "Yayın onayın bekleniyor";
  }
  return userFacingStateLabel(facing);
}

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

  const schedule = app ? toRecordingScheduleView(app) : null;
  const prepReady = facing === "READY";
  const publication = app
    ? await getKariyerPublicationCandidateState({
        candidateUserId: session.user.id,
        applicationId: app.id,
      })
    : { kind: "none" as const };

  const showPublication =
    publication.kind === "published" ||
    publication.kind === "approval_requested" ||
    publication.kind === "change_requested";

  // Priority: published / publication review > schedule > prep
  const showSchedule =
    !showPublication && schedule != null && (prepReady || schedule.scheduled);

  const showPrepActions = !showPublication && facing === "READY";

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
        <>
          <div className="panel space-y-3 text-sm">
            <p>
              Durum: <strong>{primaryStatusLabel(publication, facing)}</strong>
            </p>
            <p className="text-[var(--muted)]">
              Bu başvuru davet veya kesin kayıt tarihi değildir. Geri çekme sonrası host erişimi
              kaldırılır; daha önce indirilmiş dosyalar geri alınamayabilir.
            </p>
            <div className="flex flex-wrap gap-2">
              {showPrepActions ? (
                <Link href="/arayanlar/hazirligim" className="btn btn-primary inline-flex">
                  Notlarımı aç
                </Link>
              ) : null}
              {!showPublication ? (
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
              ) : null}
              {publication.kind === "published" && publication.publicUrl ? (
                <Link href={publication.publicUrl} className="btn btn-primary inline-flex">
                  Bölümü aç
                </Link>
              ) : null}
            </div>
          </div>

          {publication.kind === "published" ? (
            <CandidatePublicationPanel
              mode="published"
              preview={publication.preview}
              publicUrl={publication.publicUrl}
            />
          ) : null}
          {publication.kind === "approval_requested" ? (
            <CandidatePublicationPanel
              mode="approval_requested"
              preview={publication.preview}
              alreadyApproved={publication.alreadyApproved}
            />
          ) : null}
          {publication.kind === "change_requested" ? (
            <CandidatePublicationPanel
              mode="change_requested"
              preview={publication.preview}
              changeNote={publication.changeNote}
            />
          ) : null}

          {showSchedule && schedule ? (
            <CandidateRecordingSchedule schedule={schedule} prepReady={prepReady} />
          ) : null}
        </>
      )}
    </section>
  );
}
