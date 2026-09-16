import Link from "next/link";
import { requireSession } from "@/lib/session";
import { AskQuestionForm } from "@/components/community/ask-question-form";
import { listPublishedEpisodeOptions } from "@/lib/community/episodes";
import { getCommunityQuotaStatus } from "@/lib/community/quota";
import { ui } from "@/lib/ui-copy";

export default async function AskQuestionPage() {
  const session = await requireSession();
  const [episodes, quota] = await Promise.all([
    listPublishedEpisodeOptions(),
    getCommunityQuotaStatus(session.user.id, "QUESTION"),
  ]);

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/topluluk" className="text-sm text-[var(--muted)] hover:underline">
          ← Topluluk
        </Link>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl">{ui.community.askTitle}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{ui.community.askLead}</p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Günlük kota: {quota.used}/{quota.allowance} soru (anti-kötüye kullanım varsayılanı).
        </p>
      </div>
      <AskQuestionForm episodes={episodes} />
    </section>
  );
}
