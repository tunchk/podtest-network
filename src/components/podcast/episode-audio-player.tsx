import { sanitizeSpotifyEpisodeUrl } from "@/lib/podcast/sanitize";

export function EpisodeAudioPlayer({
  audioUrl,
  spotifyEpisodeUrl,
}: {
  audioUrl: string | null;
  spotifyEpisodeUrl: string | null;
}) {
  const spotify = sanitizeSpotifyEpisodeUrl(spotifyEpisodeUrl);
  const allowHttpsAudio = Boolean(audioUrl && /^https:\/\//i.test(audioUrl));

  return (
    <div className="space-y-3">
      {allowHttpsAudio ? (
        <audio controls preload="none" className="w-full" src={audioUrl!}>
          Tarayıcınız ses öğesini desteklemiyor.
        </audio>
      ) : (
        <p className="text-sm text-[var(--muted)]">Bu bölüm için doğrulanmış ses kaydı yok.</p>
      )}
      {spotify ? (
        <a
          href={spotify}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm underline"
        >
          Spotify’da dinle
        </a>
      ) : null}
    </div>
  );
}
