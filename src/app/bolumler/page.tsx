import Link from "next/link";
import { listPublishedEpisodes } from "@/lib/community/episodes";
import { getSession } from "@/lib/session";
import { ui } from "@/lib/ui-copy";

export default async function BolumlerPage() {
  const episodes = await listPublishedEpisodes();
  const session = await getSession();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.community.episodesTitle}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{ui.community.episodesLead}</p>
      </div>

      {episodes.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Henüz yayımlanmış bölüm yok. Taslak veya kaldırılmış bölümler burada görünmez.
        </p>
      ) : (
        <ul className="space-y-4">
          {episodes.map((ep) => (
            <li key={ep.id} className="border-b border-[var(--line)] pb-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{ep.series}</p>
              <h2 className="font-[family-name:var(--font-display)] text-xl">{ep.title}</h2>
              {ep.publicationDate ? (
                <p className="text-sm text-[var(--muted)]">
                  {new Date(ep.publicationDate).toLocaleDateString("tr-TR")}
                </p>
              ) : null}
              {ep.description ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{ep.description}</p>
              ) : null}
              {ep.listeningUrl ? (
                <a
                  href={ep.listeningUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm underline"
                >
                  Dinleme bağlantısı
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}

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
