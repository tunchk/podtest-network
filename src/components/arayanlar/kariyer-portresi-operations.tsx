import Link from "next/link";
import type { KariyerPortresiOperationsView } from "@/lib/arayanlar/operations";
import { opsStepStatusLabel } from "@/lib/arayanlar/operations";
import { OpsNextActionCard } from "@/components/arayanlar/ops-next-action";
import { StaffHostHandoffButton } from "@/components/arayanlar/staff-host-handoff-button";

function formatWhen(value: Date | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value instanceof Date ? value : new Date(value));
}

function stepTone(status: KariyerPortresiOperationsView["progress"][number]["status"]) {
  switch (status) {
    case "tamamlandi":
      return "text-[var(--accent-strong)]";
    case "islem_gerekiyor":
      return "text-amber-800";
    case "bekliyor":
      return "text-[var(--muted)]";
    default:
      return "text-[var(--muted)] opacity-70";
  }
}

function publicationHeading(view: KariyerPortresiOperationsView) {
  if (view.publication.candidateDecision === "change_requested") return "Değişiklik istendi";
  if (view.publication.candidateDecision === "approved") return "Aday onayladı";
  if (view.publication.candidateDecision === "waiting") return "Yayın onayı bekleniyor";
  if (view.publication.episodeId) return "Yayın sürümü";
  return "Yayın onayı";
}

export function KariyerPortresiOperationsOverview({
  view,
}: {
  view: KariyerPortresiOperationsView;
}) {
  const latest = formatWhen(view.latestTimestamp);
  const prepAt = formatWhen(view.preparation.artifactUpdatedAt);
  const handoffAt = formatWhen(view.hostHandoff.sentAt);
  const scheduleUpdated = formatWhen(view.recording.updatedAt);
  const published = view.publication.publicationState === "PUBLISHED";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl">
              {view.candidate.displayName}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {view.applicationStatusLabel}
              {view.candidate.targetRole ? ` · ${view.candidate.targetRole}` : ""}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium text-[var(--ink)]">{view.primaryLabel}</p>
            {latest ? <p className="text-[var(--muted)]">{latest}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-sm print:hidden">
          <Link href={view.preparation.notesPath} className="text-[var(--accent)]">
            Host notlarını aç
          </Link>
          <Link href="/sunucu/basvurular" className="text-[var(--accent)]">
            Listeye dön
          </Link>
        </div>
      </header>

      {view.issues.length > 0 ? (
        <aside className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Dikkat</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {view.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </aside>
      ) : null}

      <nav aria-label="Operasyon ilerlemesi" className="panel">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {view.progress.map((step) => (
            <li key={step.id} className="min-w-0">
              <p className="text-sm font-medium text-[var(--ink)]">{step.label}</p>
              <p className={`text-xs ${stepTone(step.status)}`}>
                {opsStepStatusLabel(step.status)}
              </p>
              {step.detail ? (
                <p className="mt-1 truncate text-xs text-[var(--muted)]" title={step.detail}>
                  {step.detail}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </nav>

      <OpsNextActionCard
        applicationId={view.applicationId}
        notesPath={view.preparation.notesPath}
        nextAction={view.nextAction}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="panel space-y-2 text-sm">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Hazırlık</h2>
          <p>
            Durum: <strong>{view.preparation.label}</strong>
          </p>
          {view.preparation.templateVersion ? (
            <p className="text-[var(--muted)]">Şablon: {view.preparation.templateVersion}</p>
          ) : null}
          {prepAt ? <p className="text-[var(--muted)]">Notlar: {prepAt}</p> : null}
          <p className="text-[var(--muted)]">
            Host notları: {view.preparation.notesExist ? "var" : "yok"}
          </p>
          <Link href={view.preparation.notesPath} className="text-[var(--accent)]">
            Host notlarını aç
          </Link>
        </article>

        <article className="panel space-y-3 text-sm">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Host</h2>
          <p>
            Varsayılan host:{" "}
            <strong>
              {view.hostHandoff.defaultHostName ?? "yapılandırılmamış"}
            </strong>
          </p>
          <p className="text-[var(--muted)]">
            Yetki:{" "}
            {view.hostHandoff.defaultHostAuthorized ? "yetkili" : "eksik / yetkisiz"}
          </p>
          {view.hostHandoff.assignedHostName ? (
            <p className="text-[var(--muted)]">
              Atanan: {view.hostHandoff.assignedHostName}
            </p>
          ) : null}
          <p>
            Handoff:{" "}
            <strong>{view.hostHandoff.sent ? "gönderildi" : "gönderilmedi"}</strong>
            {handoffAt ? ` · ${handoffAt}` : ""}
          </p>
          {view.preparation.ready && !view.hostHandoff.sent ? (
            <StaffHostHandoffButton applicationId={view.applicationId} mode="send" />
          ) : null}
          {view.hostHandoff.canResend ? (
            <StaffHostHandoffButton applicationId={view.applicationId} mode="resend" />
          ) : view.hostHandoff.sent ? (
            <p className="text-[var(--muted)]">Gönderildi</p>
          ) : null}
        </article>

        <article className="panel space-y-2 text-sm lg:col-span-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Kayıt özeti</h2>
          {view.recording.scheduled && view.recording.displayWhen ? (
            <>
              <p>
                Zaman: <strong>{view.recording.displayWhen}</strong>
              </p>
              <p className="text-[var(--muted)]">
                Saat dilimi: {view.recording.timeZone ?? "—"}
              </p>
              {view.recording.meetingUrl ? (
                <p className="text-[var(--muted)]">
                  Bağlantı:{" "}
                  <a
                    href={view.recording.meetingUrl}
                    className="text-[var(--accent)]"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {view.recording.meetingUrl}
                  </a>
                </p>
              ) : null}
              {view.recording.note ? (
                <p className="text-[var(--muted)]">Not: {view.recording.note}</p>
              ) : null}
              {view.recording.scheduledByName ? (
                <p className="text-[var(--muted)]">
                  Planlayan: {view.recording.scheduledByName}
                </p>
              ) : null}
              {scheduleUpdated ? (
                <p className="text-[var(--muted)]">Güncellendi: {scheduleUpdated}</p>
              ) : null}
            </>
          ) : (
            <p className="text-[var(--muted)]">Henüz kayıt zamanı belirlenmedi.</p>
          )}
          <p className="text-xs text-[var(--muted)]">
            Düzenleme için aşağıdaki kayıt formu kullanılır.
          </p>
        </article>

        <article className="panel space-y-3 text-sm lg:col-span-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg">
            {publicationHeading(view)}
          </h2>
          {view.publication.episodeId ? (
            <>
              <p>
                Bölüm: <strong>{view.publication.title ?? "—"}</strong>
              </p>
              {view.publication.reviewRequested ? (
                <p className="text-[var(--muted)]">
                  Onaya gönderildi
                  {formatWhen(view.publication.reviewRequestedAt)
                    ? ` · ${formatWhen(view.publication.reviewRequestedAt)}`
                    : ""}
                </p>
              ) : (
                <p className="text-[var(--muted)]">Onaya henüz gönderilmedi.</p>
              )}
              {!view.publication.versionMatchesReview && view.publication.reviewRequested ? (
                <p className="text-amber-800">
                  Sürüm değişti; mevcut onay geçersiz. Yeniden gönderin.
                </p>
              ) : null}
              {view.publication.candidateDecision === "change_requested" &&
              view.publication.changeNote ? (
                <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                  <p className="font-medium">Adayın notu</p>
                  <p className="mt-1">{view.publication.changeNote}</p>
                </div>
              ) : null}
              {view.publication.alreadyApprovedCurrent ? (
                <p className="text-[var(--accent-strong)]">Bu sürüm aday tarafından onaylandı.</p>
              ) : null}
              {!view.publication.canPublish && view.publication.publishBlockedReason ? (
                <p className="text-[var(--muted)]">{view.publication.publishBlockedReason}</p>
              ) : null}
            </>
          ) : (
            <p className="text-[var(--muted)]">
              Bağlı yayın bölümü yok. Kayıt sonrası sürüm burada hazırlanır.
            </p>
          )}
        </article>

        {published ? (
          <article className="panel space-y-3 border-[var(--accent)]/50 lg:col-span-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--accent-strong)]">
              Kariyer Portresi yayında
            </h2>
            <p>
              <strong>{view.publication.title}</strong>
            </p>
            {formatWhen(view.activity.find((a) => a.id === "published")?.at) ? (
              <p className="text-sm text-[var(--muted)]">
                Yayın: {formatWhen(view.activity.find((a) => a.id === "published")?.at)}
              </p>
            ) : null}
            {view.publication.publicPath ? (
              <Link href={view.publication.publicPath} className="btn btn-primary">
                Bölümü aç
              </Link>
            ) : (
              <p className="text-sm text-amber-800">Herkese açık bölüm adresi eksik.</p>
            )}
          </article>
        ) : null}
      </div>

      {view.activity.length > 0 ? (
        <article className="panel space-y-3 text-sm">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Son hareketler</h2>
          <ol className="space-y-2">
            {view.activity.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-2">
                <span>{item.label}</span>
                <span className="text-[var(--muted)]">{formatWhen(item.at)}</span>
              </li>
            ))}
          </ol>
        </article>
      ) : null}
    </div>
  );
}
