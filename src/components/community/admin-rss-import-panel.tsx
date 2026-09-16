"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_PODCAST_RSS_URL } from "@/lib/podcast/rss-parse";

type Preview = {
  feedUrl: string;
  feedTitle: string;
  feedIdentity: string | null;
  itemCount: number;
  truncated: boolean;
  parseWarnings: string[];
  counts: { new: number; update: number; skip: number; conflict: number };
  validationErrors: string[];
  conflicts: Array<{
    identity: string;
    title: string;
    matchedEpisodeId: string;
    matchedTitle: string;
    reason: string;
  }>;
  skipped: Array<{ title: string; reason: string }>;
  publishNote: string;
};

type EpisodeRow = {
  id: string;
  series: string;
  title: string;
  publicationState: string;
  slug?: string;
  spotifyEpisodeUrl?: string | null;
  sourceKind?: string;
};

export function AdminRssImportPanel({ episodes }: { episodes: EpisodeRow[] }) {
  const router = useRouter();
  const [feedUrl, setFeedUrl] = useState(DEFAULT_PODCAST_RSS_URL);
  const [configured, setConfigured] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolutions, setResolutions] = useState<
    Record<string, { action: "link" | "skip"; episodeId?: string }>
  >({});
  const [spotifyDrafts, setSpotifyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/podcast-rss");
      if (!res.ok) return;
      const data = await res.json();
      if (data.config?.feedUrl) {
        setFeedUrl(data.config.feedUrl);
        setConfigured(Boolean(data.config.id));
      } else {
        setFeedUrl(DEFAULT_PODCAST_RSS_URL);
      }
    })();
  }, []);

  async function saveUrl() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/podcast-rss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_url", feedUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Hata");
        return;
      }
      setConfigured(true);
      setMsg("RSS adresi kaydedildi.");
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    setError(null);
    setBusy(true);
    setPreview(null);
    try {
      const res = await fetch("/api/admin/podcast-rss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", feedUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? data.message ?? "Önizleme başarısız");
        return;
      }
      setPreview(data.preview);
      const next: typeof resolutions = {};
      for (const c of data.preview.conflicts as Preview["conflicts"]) {
        next[c.identity] = { action: "skip", episodeId: c.matchedEpisodeId };
      }
      setResolutions(next);
      setMsg(null);
    } finally {
      setBusy(false);
    }
  }

  async function runImport(refresh: boolean) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/podcast-rss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: refresh ? "refresh" : "import",
          feedUrl,
          publishNew: true,
          resolutions: Object.entries(resolutions).map(([identity, r]) => ({
            identity,
            ...r,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? data.message ?? "İçe aktarım başarısız");
        return;
      }
      const r = data.result;
      setMsg(
        `İçe aktarım: +${r.created} yeni, ${r.updated} güncellendi, ${r.linked} bağlandı, ${r.skipped} atlandı, ${r.failed} hata. Mevcut bölümler korundu.`,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveSpotify(episodeId: string) {
    const res = await fetch("/api/admin/podcast-rss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_spotify",
        episodeId,
        spotifyEpisodeUrl: spotifyDrafts[episodeId] ?? "",
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Spotify bağlantısı kaydedildi." : (data.error ?? "Hata"));
    if (res.ok) router.refresh();
  }

  return (
    <section className="space-y-4 border-t border-[var(--line)] pt-6">
      <h2 className="font-[family-name:var(--font-display)] text-xl">RSS’ten içe aktar</h2>
      <p className="text-sm text-[var(--muted)]">
        Önizleme gerçek yayını çeker; içe aktarım açık onay ister. Ses dosyası indirilmez. Spotify
        bölüm bağlantısı yoksa uydurulmaz. PodTest+ veya ödeme gerekmez.
      </p>
      {!configured ? (
        <p className="text-xs text-[var(--muted)]">
          Kayıtlı adres yok — varsayılan ön dolduruldu; kaydetmeden içe aktarım yine bu URL’yi
          kullanabilir.
        </p>
      ) : null}
      <input
        className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-mono text-sm"
        value={feedUrl}
        onChange={(e) => setFeedUrl(e.target.value)}
        aria-label="RSS adresi"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveUrl()}
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
        >
          Adresi kaydet
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runPreview()}
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
        >
          Önizle
        </button>
        <button
          type="button"
          disabled={busy || !preview}
          onClick={() => void runImport(false)}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          RSS’ten içe aktar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runImport(true)}
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
        >
          RSS’i yenile
        </button>
      </div>

      {preview ? (
        <div className="space-y-2 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
          <p>
            <span className="font-medium">{preview.feedTitle}</span> · {preview.itemCount} bölüm
            {preview.truncated ? " (kırpıldı)" : ""}
          </p>
          <p className="text-[var(--muted)]">
            Yeni: {preview.counts.new} · Güncelleme: {preview.counts.update} · Atlanan:{" "}
            {preview.counts.skip} · Çakışma: {preview.counts.conflict}
          </p>
          <p className="text-xs text-[var(--muted)]">{preview.publishNote}</p>
          {preview.parseWarnings.length ? (
            <ul className="list-disc pl-5 text-xs text-[var(--muted)]">
              {preview.parseWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {preview.conflicts.length ? (
            <div className="space-y-2">
              <p className="font-medium">Çakışmalar (başlıkla birleştirilmez)</p>
              {preview.conflicts.map((c) => (
                <div key={c.identity} className="rounded border border-[var(--line)] p-2 text-xs">
                  <p>
                    RSS: {c.title} ↔ Katalog: {c.matchedTitle}
                  </p>
                  <p className="text-[var(--muted)]">{c.reason}</p>
                  <select
                    className="mt-1 rounded border px-2 py-1"
                    value={resolutions[c.identity]?.action ?? "skip"}
                    onChange={(e) =>
                      setResolutions((prev) => ({
                        ...prev,
                        [c.identity]: {
                          action: e.target.value as "link" | "skip",
                          episodeId: c.matchedEpisodeId,
                        },
                      }))
                    }
                  >
                    <option value="skip">Atla</option>
                    <option value="link">GUID bağla (elle onay)</option>
                  </select>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}

      <div className="space-y-2">
        <h3 className="font-medium">Spotify bölüm bağlantısı (isteğe bağlı)</h3>
        <p className="text-xs text-[var(--muted)]">
          Yalnızca Spotify bölüm sayfası bağlantıları kabul edilir.
        </p>
        <ul className="max-h-64 space-y-2 overflow-auto text-sm">
          {episodes.slice(0, 40).map((ep) => (
            <li key={ep.id} className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] pb-2">
              <span className="min-w-0 flex-1 truncate">
                [{ep.publicationState}] {ep.title}
              </span>
              <input
                className="min-w-[14rem] flex-1 rounded border px-2 py-1 font-mono text-xs"
                placeholder="open.spotify.com/episode/…"
                defaultValue={ep.spotifyEpisodeUrl ?? ""}
                onChange={(e) =>
                  setSpotifyDrafts((prev) => ({ ...prev, [ep.id]: e.target.value }))
                }
              />
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() => void saveSpotify(ep.id)}
              >
                Kaydet
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
