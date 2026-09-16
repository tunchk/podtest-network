"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AskQuestionForm({
  episodes,
}: {
  episodes: Array<{ id: string; series: string; title: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function saveDraft() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/topluluk/sorular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: draftId ? "update" : "create",
          questionId: draftId ?? undefined,
          title,
          body,
          topicTags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          episodeId: episodeId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Hata");
        return;
      }
      setDraftId(data.question.id);
      setStatusMsg("Taslak kaydedildi. Henüz herkese açık değil.");
    } finally {
      setPending(false);
    }
  }

  async function publish() {
    if (!acknowledged) {
      setError("Yayımlamadan önce kamuya açıklık uyarısını onaylamalısın.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      let id = draftId;
      if (!id) {
        const createRes = await fetch("/api/topluluk/sorular", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            title,
            body,
            topicTags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            episodeId: episodeId || null,
          }),
        });
        const created = await createRes.json();
        if (!createRes.ok) {
          setError(created.error ?? "Hata");
          return;
        }
        id = created.question.id as string;
        setDraftId(id);
      } else {
        await fetch("/api/topluluk/sorular", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            questionId: id,
            title,
            body,
            topicTags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            episodeId: episodeId || null,
          }),
        });
      }

      const submitRes = await fetch("/api/topluluk/sorular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          questionId: id,
          idempotencyKey: `ui-submit-${id}-${Date.now()}`,
        }),
      });
      const submitted = await submitRes.json();
      if (!submitRes.ok) {
        setError(submitted.error ?? "Hata");
        return;
      }
      if (submitted.question.status === "PUBLISHED") {
        router.push(`/topluluk/sorular/${submitted.question.id}`);
        router.refresh();
        return;
      }
      setStatusMsg(
        submitted.question.status === "PENDING_REVIEW"
          ? "İçerik inceleme için bekletildi; önceki onaylı sürüm varsa o görünür kalır."
          : submitted.question.moderationReason ?? "Gönderildi.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Başlık (en fazla 160 karakter)</span>
        <input
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
          value={title}
          maxLength={160}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Soru metni (düz metin; güvenli bağlantılar)</span>
        <textarea
          className="mt-1 min-h-40 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Konu etiketleri (virgülle, isteğe bağlı)</span>
        <input
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Podcast bölümü (isteğe bağlı, yalnızca yayımlanmış)</span>
        <select
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
          value={episodeId}
          onChange={(e) => setEpisodeId(e.target.value)}
        >
          <option value="">Yok</option>
          {episodes.map((ep) => (
            <option key={ep.id} value={ep.id}>
              {ep.series} — {ep.title}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-md border border-[var(--line)] bg-[var(--accent-soft)] p-3 text-sm">
        <p>
          Yayımlamadan önce: soru metnin ve görünen adın herkese açık olur. Profilin yayımlanmamış
          olsa bile bu içerik kamuya görünür. E-posta ve özel profil alanları gösterilmez.
        </p>
        <label className="mt-2 flex items-start gap-2">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1"
          />
          <span>Anladım; yayımlamak istiyorum.</span>
        </label>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {statusMsg ? <p className="text-sm text-[var(--muted)]">{statusMsg}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending || !title.trim() || !body.trim()}
          onClick={() => void saveDraft()}
          className="rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--surface)] disabled:opacity-50"
        >
          Taslak kaydet
        </button>
        <button
          type="button"
          disabled={pending || !title.trim() || !body.trim()}
          onClick={() => void publish()}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          Yayımla
        </button>
      </div>
    </div>
  );
}
