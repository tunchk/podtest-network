import Link from "next/link";

export type EpisodeCardData = {
  slug: string;
  series: string;
  title: string;
  description: string | null;
  publicationDate: Date | string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
};

function formatDuration(seconds: number | null) {
  if (seconds == null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Deterministic TR date — fixed timezone avoids server/client hydration drift. */
function formatPublicationDate(value: Date | string) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(d);
}

export function EpisodeCard({ episode }: { episode: EpisodeCardData }) {
  const date = episode.publicationDate ? formatPublicationDate(episode.publicationDate) : null;
  const duration = formatDuration(episode.durationSeconds);
  const short =
    episode.description && episode.description.length > 180
      ? `${episode.description.slice(0, 180).trim()}…`
      : episode.description;

  return (
    <article className="flex gap-4 border-b border-[var(--line)] pb-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-[var(--surface)]">
        {episode.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={episode.artworkUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--muted)]">
            Kapak yok
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{episode.series}</p>
        <h2 className="font-[family-name:var(--font-display)] text-lg">
          <Link href={`/bolumler/${episode.slug}`} className="hover:underline">
            {episode.title}
          </Link>
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {[date, duration].filter(Boolean).join(" · ")}
        </p>
        {short ? <p className="mt-1 text-sm text-[var(--muted)]">{short}</p> : null}
      </div>
    </article>
  );
}
