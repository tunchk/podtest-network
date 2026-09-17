"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Initial = {
  episodeId: string | null;
  title: string;
  description: string;
  artworkUrl: string;
  listeningUrl: string;
  reviewRequested: boolean;
  reviewVersionId: string | null;
  changeNote: string | null;
  publicationState: string | null;
  alreadyApproved: boolean;
};

export function HostPublicationPanel({
  applicationId,
  initial,
}: {
  applicationId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [episodeId, setEpisodeId] = useState(initial.episodeId ?? "");
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [artworkUrl, setArtworkUrl] = useState(initial.artworkUrl);
  const [listeningUrl, setListeningUrl] = useState(initial.listeningUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reviewRequested, setReviewRequested] = useState(initial.reviewRequested);
  const [changeNote, setChangeNote] = useState(initial.changeNote);
  const [publicationState, setPublicationState] = useState(initial.publicationState);
  const [alreadyApproved, setAlreadyApproved] = useState(initial.alreadyApproved);

  async function post(action: "send_for_approval" | "publish") {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/sunucu/basvurular/${applicationId}/publication`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "publish"
            ? { action: "publish" }
            : {
                action: "send_for_approval",
                episodeId: episodeId.trim() || null,
                title,
                description: description.trim() || null,
                artworkUrl: artworkUrl.trim() || null,
                listeningUrl: listeningUrl.trim() || null,
              },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        episode?: { id?: string; publicationState?: string; title?: string };
        publicationVersionId?: string;
        alreadyApproved?: boolean;
      };
      if (!res.ok) {
        setError(data.message ?? "İşlem başarısız.");
        return;
      }
      if (action === "send_for_approval") {
        setReviewRequested(true);
        setChangeNote(null);
        if (data.episode?.id) setEpisodeId(data.episode.id);
        if (data.episode?.title) setTitle(data.episode.title);
        setStatus("Yayın onayı için adaya gönderildi.");
      } else {
        setPublicationState(data.episode?.publicationState ?? "PUBLISHED");
        setStatus("Bölüm yayınlandı.");
      }
      if (typeof data.alreadyApproved === "boolean") {
        setAlreadyApproved(data.alreadyApproved);
      }
      router.refresh();
    } catch {
      setError("İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  }

  const published = publicationState === "PUBLISHED";

  return (
    <article className="panel space-y-4 text-sm print:hidden">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg">Yayın onayı</h2>
        <p className="mt-2 text-[var(--muted)]">
          Adayın onaylayacağı yayın sürümünü hazırla. Onay alınmadan bölüm kamuya
          açılmaz.
        </p>
      </div>

      {changeNote ? (
        <p className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
          <span className="font-medium">Aday değişiklik istedi:</span> {changeNote}
        </p>
      ) : null}

      {reviewRequested && !published ? (
        <p className="text-[var(--muted)]">
          {alreadyApproved
            ? "Aday bu sürümü onayladı. Yayınlayabilirsin."
            : "Adayın onayı bekleniyor."}
        </p>
      ) : null}

      {published ? (
        <p className="font-medium text-[var(--accent-strong)]">Bölüm yayında.</p>
      ) : (
        <>
          <div className="grid gap-3">
            <label className="field mb-0">
              <span>Mevcut bölüm kimliği (isteğe bağlı)</span>
              <input
                value={episodeId}
                onChange={(e) => setEpisodeId(e.target.value)}
                placeholder="Boş bırakırsan yeni taslak oluşturulur"
              />
            </label>
            <label className="field mb-0">
              <span>Bölüm adı</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label className="field mb-0">
              <span>Kısa açıklama</span>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="field mb-0">
              <span>Kapak URL (isteğe bağlı)</span>
              <input
                type="url"
                value={artworkUrl}
                onChange={(e) => setArtworkUrl(e.target.value)}
              />
            </label>
            <label className="field mb-0">
              <span>Dinleme bağlantısı (isteğe bağlı)</span>
              <input
                type="url"
                value={listeningUrl}
                onChange={(e) => setListeningUrl(e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (!title.trim() && !episodeId.trim())}
              onClick={() => void post("send_for_approval")}
            >
              Yayın onayına gönder
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !reviewRequested || !alreadyApproved}
              onClick={() => void post("publish")}
              title={
                alreadyApproved
                  ? undefined
                  : "Aday onayı olmadan yayınlanamaz"
              }
            >
              Yayına al
            </button>
          </div>
        </>
      )}

      {status ? (
        <p className="text-[var(--muted)]" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
