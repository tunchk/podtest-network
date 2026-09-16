import Link from "next/link";
import { listPublishedQuestions } from "@/lib/community/questions";
import { communityModerationLabel } from "@/lib/community/moderation";
import { getSession } from "@/lib/session";
import { ui } from "@/lib/ui-copy";

type SearchParams = Promise<{ sayfa?: string }>;

export default async function ToplulukPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = Number(sp.sayfa ?? "1");
  const list = await listPublishedQuestions({ page });
  const session = await getSession();
  const mod = communityModerationLabel();

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.community.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{ui.community.lead}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/bolumler" className="rounded-md border border-[var(--line)] px-3 py-2 hover:bg-[var(--surface)]">
            {ui.community.episodes}
          </Link>
          {session?.user ? (
            <Link
              href="/topluluk/sor"
              className="rounded-md bg-[var(--accent)] px-3 py-2 font-medium text-white hover:bg-[var(--accent-strong)]"
            >
              {ui.community.ask}
            </Link>
          ) : (
            <Link href="/giris" className="rounded-md border border-[var(--line)] px-3 py-2">
              Soru sormak için giriş yap
            </Link>
          )}
        </div>
      </div>

      <p className="rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-strong)]">
        {mod.description} Adaptör: {mod.adapter} · politika {mod.policyVersion}
      </p>

      {list.items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{ui.community.empty}</p>
      ) : (
        <ul className="space-y-3">
          {list.items.map((q) => (
            <li key={q.id} className="border-b border-[var(--line)] pb-3">
              <Link
                href={`/topluluk/sorular/${q.id}`}
                className="font-medium text-[var(--ink)] hover:underline"
              >
                {q.title}
              </Link>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {q.authorDisplayName}
                {q.publishedAt
                  ? ` · ${new Date(q.publishedAt).toLocaleDateString("tr-TR")}`
                  : null}
                {q.episode ? ` · ${q.episode.series}: ${q.episode.title}` : null}
              </p>
              {q.topicTags.length ? (
                <p className="mt-1 text-xs text-[var(--muted)]">{q.topicTags.join(" · ")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-3 text-sm">
        {page > 1 ? (
          <Link href={`/topluluk?sayfa=${page - 1}`} className="underline">
            Önceki
          </Link>
        ) : null}
        {page * list.pageSize < list.total ? (
          <Link href={`/topluluk?sayfa=${page + 1}`} className="underline">
            Sonraki
          </Link>
        ) : null}
      </div>
    </section>
  );
}
