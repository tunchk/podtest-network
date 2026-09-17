import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getHostPackForAssignedHost } from "@/lib/arayanlar/service";
import { HostPrepReadonly } from "@/components/arayanlar/host-prep-readonly";
import { HostRecordingScheduleForm } from "@/components/arayanlar/host-recording-schedule-form";
import { HostPublicationPanel } from "@/components/arayanlar/host-publication-panel";
import { toRecordingScheduleView } from "@/lib/arayanlar/recording-schedule";
import {
  DEFAULT_RECORDING_TIMEZONE,
  wallPartsFromUtc,
} from "@/lib/arayanlar/recording-time";
import { getHostPublicationPanelInitial } from "@/lib/arayanlar/publication-host";
import type { SubmittedFacts } from "@/lib/arayanlar/constants";

type Props = { params: Promise<{ id: string }> };

/**
 * Host-safe read-only producer notes for recording.
 * No raw CV. No guest-only route. No second AI generation.
 */
export default async function SunucuBasvuruNotlarPage({ params }: Props) {
  const session = await requireSession();
  const { id } = await params;
  const result = await getHostPackForAssignedHost({
    hostUserId: session.user.id,
    applicationId: id,
  });

  if (!result.ok) {
    redirect("/sunucu/basvurular");
  }

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { staffRole: true },
  });
  const facts = result.application.submittedFacts as SubmittedFacts;
  const schedule = toRecordingScheduleView(result.application);
  const tz = schedule.timeZone || DEFAULT_RECORDING_TIMEZONE;
  const wall =
    schedule.scheduledAt != null
      ? wallPartsFromUtc(schedule.scheduledAt, tz)
      : { date: "", time: "" };
  const publicationInitial = await getHostPublicationPanelInitial(id, {
    actorIsAdmin: actor?.staffRole === "ADMIN",
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Kayıt notları</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Salt okunur yapımcı notları. Ham CV burada yoktur.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm print:hidden">
          <Link href={`/sunucu/basvurular/${id}`} className="text-[var(--accent)]">
            Düzenleme görünümü
          </Link>
          <Link href="/sunucu/basvurular" className="text-[var(--accent)]">
            Listeye dön
          </Link>
        </div>
      </div>

      <article className="panel space-y-2 text-sm">
        <h2 className="font-[family-name:var(--font-display)] text-lg">Onaylı kimlik</h2>
        <p className="text-[var(--muted)]">
          {facts.displayName}
          {facts.targetRole ? ` · ${facts.targetRole}` : ""}
        </p>
      </article>

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

      {publicationInitial ? (
        <HostPublicationPanel applicationId={id} initial={publicationInitial} />
      ) : null}

      <HostPrepReadonly pack={result.effective} />
    </section>
  );
}
