import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getHostPackForAssignedHost } from "@/lib/arayanlar/service";
import { getKariyerPortresiOperationsView } from "@/lib/arayanlar/operations";
import { KariyerPortresiOperationsOverview } from "@/components/arayanlar/kariyer-portresi-operations";
import { HostPackEditor } from "@/components/arayanlar/host-pack-editor";
import { HostRecordingScheduleForm } from "@/components/arayanlar/host-recording-schedule-form";
import { HostPublicationPanel } from "@/components/arayanlar/host-publication-panel";
import {
  DEFAULT_RECORDING_TIMEZONE,
  wallPartsFromUtc,
} from "@/lib/arayanlar/recording-time";
import { getHostPublicationPanelInitial } from "@/lib/arayanlar/publication-host";
import type { SubmittedFacts } from "@/lib/arayanlar/constants";

type Props = { params: Promise<{ id: string }> };

/**
 * Kariyer Portresi operations control center for assigned host / ADMIN.
 * Read-only derivation on load — no mutations from rendering.
 */
export default async function SunucuBasvuruDetailPage({ params }: Props) {
  const session = await requireSession();
  const { id } = await params;

  const ops = await getKariyerPortresiOperationsView({
    actorUserId: session.user.id,
    applicationId: id,
  });
  if (!ops.ok) {
    redirect("/sunucu/basvurular");
  }

  const { view } = ops;
  const schedule = view.recording;
  const tz = schedule.timeZone || DEFAULT_RECORDING_TIMEZONE;
  const wall =
    schedule.scheduledAt != null
      ? wallPartsFromUtc(schedule.scheduledAt, tz)
      : { date: "", time: "" };
  const publicationInitial = await getHostPublicationPanelInitial(id, {
    actorIsAdmin: view.actor.isAdmin,
  });

  const hostPack = await getHostPackForAssignedHost({
    hostUserId: session.user.id,
    applicationId: id,
  });
  const facts =
    (view.facts as SubmittedFacts | null) ??
    (hostPack.ok ? (hostPack.application.submittedFacts as SubmittedFacts) : null);

  return (
    <section className="space-y-8">
      <KariyerPortresiOperationsOverview view={view} />

      {facts ? (
        <article className="panel space-y-3 text-sm">
          <h2 className="font-[family-name:var(--font-display)] text-lg">
            Üye onaylı gerçekler (salt okunur)
          </h2>
          <ul className="space-y-1 text-[var(--muted)]">
            <li>Ad: {facts.displayName}</li>
            <li>Hedef rol: {facts.targetRole || "—"}</li>
            <li>Hikâye: {facts.storyTopic || "—"}</li>
            <li>Katkı: {facts.contribution || "—"}</li>
            <li>Tercihler: {facts.workPreferences || "—"}</li>
            <li>Hariç: {facts.excludedTopics || "—"}</li>
            <li>İletişim: {facts.contactChannel || "—"}</li>
          </ul>
        </article>
      ) : null}

      <div id="kayit-plani">
        <HostRecordingScheduleForm
          applicationId={id}
          initial={{
            scheduled: schedule.scheduled,
            displayWhen: schedule.displayWhen,
            timeZone: schedule.timeZone,
            meetingUrl: schedule.meetingUrl,
            note: schedule.note,
            dateValue: wall.date,
            timeValue: wall.time,
          }}
        />
      </div>

      <div id="yayin-onayi">
        {publicationInitial ? (
          <HostPublicationPanel applicationId={id} initial={publicationInitial} />
        ) : null}
      </div>

      {hostPack.ok ? (
        <HostPackEditor
          applicationId={id}
          initial={hostPack.effective}
          hasHostEdits={hostPack.hasHostEdits}
          schemaKind={hostPack.schemaKind}
        />
      ) : null}
    </section>
  );
}
