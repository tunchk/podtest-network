import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedEpisodeBySlug } from "@/lib/community/episodes";
import { EpisodeAudioPlayer } from "@/components/podcast/episode-audio-player";
import { sanitizeSpotifyEpisodeUrl } from "@/lib/podcast/sanitize";

type Params = Promise<{ slug: string }>;

export default async function BolumDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await getPublishedEpisodeBySlug(slug);
  if (!data) notFound();
  const { episode, guests } = data;
  const spotify = sanitizeSpotifyEpisodeUrl(episode.spotifyEpisodeUrl);
  const date = episode.publicationDate
    ? new Date(episode.publicationDate).toLocaleDateString("tr-TR")
    : null;

  return (
    <article className="space-y-6">
      <Link href="/bolumler" className="text-sm text-[var(--muted)] hover:underline">
        ← Tüm bölümler
      </Link>
      <header className="flex flex-col gap-4 sm:flex-row">
        <div className="h-40 w-40 shrink-0 overflow-hidden rounded-md bg-[var(--surface)]">
          {episode.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={episode.artworkUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
              Kapak yok
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{episode.series}</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">{episode.title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {[date, episode.seasonNumber != null ? `Sezon ${episode.seasonNumber}` : null, episode.episodeNumber != null ? `Bölüm ${episode.episodeNumber}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>

      <EpisodeAudioPlayer audioUrl={episode.audioUrl} spotifyEpisodeUrl={spotify} />

      {episode.descriptionHtml ? (
        <div
          className="prose-podcast space-y-2 text-sm leading-relaxed text-[var(--ink)] [&_a]:underline [&_li]:ml-4 [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: episode.descriptionHtml }}
        />
      ) : episode.description ? (
        <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{episode.description}</p>
      ) : (
        <p className="text-sm text-[var(--muted)]">Açıklama yok.</p>
      )}

      {guests.length ? (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Konuklar</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {guests.map((g) =>
              g ? (
                <li key={g.slug}>
                  <Link href={`/u/${g.slug}`} className="underline">
                    {g.displayName}
                  </Link>
                  {g.creditLabel ? (
                    <span className="text-[var(--muted)]"> — {g.creditLabel}</span>
                  ) : null}
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}

      {episode.listeningUrl && !spotify ? (
        <p className="text-sm">
          <a
            href={episode.listeningUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Kaynak sayfa
          </a>
        </p>
      ) : null}
    </article>
  );
}
