import Link from "next/link";
import { listPublishedEpisodes } from "@/lib/community/episodes";
import { getSession } from "@/lib/session";
import { EpisodeCard } from "@/components/podcast/episode-card";
import { ui } from "@/lib/ui-copy";

type SearchParams = Promise<{ sayfa?: string; q?: string }>;

export default async function BolumlerPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = Number(sp.sayfa ?? "1");
  const q = sp.q?.trim() || undefined;
  const { items, total, pageSize } = await listPublishedEpisodes({ page, q, pageSize: 20 });
  const session = await getSession();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.community.episodesTitle}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{ui.community.episodesLead}</p>
      </div>

      <form className="flex flex-wrap gap-2" method="get">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Başlık ara"
          className="min-w-[12rem] flex-1 rounded-md border border-[var(--line)] px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border px-3 py-2 text-sm">
          Ara
        </button>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {q
            ? "Aramanızla eşleşen yayımlanmış bölüm yok."
            : "Henüz yayımlanmış bölüm yok."}
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((ep) => (
            <li key={ep.id}>
              <EpisodeCard episode={ep} />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="flex flex-wrap gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/bolumler?sayfa=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="underline"
            >
              Önceki
            </Link>
          ) : null}
          <span className="text-[var(--muted)]">
            Sayfa {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/bolumler?sayfa=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="underline"
            >
              Sonraki
            </Link>
          ) : null}
        </nav>
      ) : null}

      {session?.user ? (
        <p className="text-sm text-[var(--muted)]">
          Görünüm talebi için{" "}
          <Link href="/hesabim/gorunumler" className="underline">
            hesabımdaki görünümler
          </Link>{" "}
          sayfasını kullan.
        </p>
      ) : null}
    </section>
  );
}
