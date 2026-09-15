import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getHostPackForAssignedHost } from "@/lib/arayanlar/service";
import { HostPackEditor } from "@/components/arayanlar/host-pack-editor";
import type { SubmittedFacts } from "@/lib/arayanlar/constants";

type Props = { params: Promise<{ id: string }> };

export default async function SunucuBasvuruDetailPage({ params }: Props) {
  const session = await requireSession();
  const { id } = await params;
  const result = await getHostPackForAssignedHost({
    hostUserId: session.user.id,
    applicationId: id,
  });

  if (!result.ok) {
    redirect("/sunucu/basvurular");
  }

  const facts = result.application.submittedFacts as SubmittedFacts;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Üretim paketi</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Üye onaylı gerçekler değiştirilemez. Düzenlemelerin ayrı saklanır; yeniden üretim onları silmez.
          </p>
        </div>
        <Link href="/sunucu/basvurular" className="text-sm text-[var(--accent)] print:hidden">
          Listeye dön
        </Link>
      </div>

      <article className="panel space-y-3 text-sm">
        <h2 className="font-[family-name:var(--font-display)] text-lg">Üye onaylı gerçekler (salt okunur)</h2>
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

      <HostPackEditor applicationId={id} initial={result.effective} hasHostEdits={result.hasHostEdits} />
    </section>
  );
}
