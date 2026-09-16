import { requireStaff } from "@/lib/session";
import { listHeldItems, listOpenModerationCases } from "@/lib/messaging/reports";
import { ModerationQueueClient } from "@/components/community/moderation-queue-client";

export default async function ModerasyonPage() {
  const { user } = await requireStaff(["ADMIN", "MODERATOR"]);
  const [cases, holds] = await Promise.all([
    listOpenModerationCases(user.id),
    listHeldItems(user.id),
  ]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">İçerik moderasyonu</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Mevcut rapor kuyruğu ve bekletilen içerikler. Podcast sunucuları otomatik moderatör değildir.
          Kanıt anlık görüntüleri minimaldir.
        </p>
      </div>
      <ModerationQueueClient
        cases={cases.map((c) => ({
          id: c.id,
          report: {
            id: c.report.id,
            targetType: c.report.targetType,
            targetId: c.report.targetId,
            reasonCode: c.report.reasonCode,
            explanation: c.report.explanation,
            evidenceSnapshot: c.report.evidenceSnapshot,
          },
        }))}
        holds={holds.map((h) => ({
          id: h.id,
          kind: h.kind,
          createdAt: h.createdAt.toISOString(),
          payload: h.payload,
        }))}
      />
    </section>
  );
}
