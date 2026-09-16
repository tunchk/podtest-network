"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AppearanceRequestForm({
  episodes,
}: {
  episodes: Array<{ id: string; series: string; title: string }>;
}) {
  const router = useRouter();
  const [episodeId, setEpisodeId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    const res = await fetch("/api/bolumler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_appearance", episodeId }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Talep gönderildi (yönetici onayı bekleniyor)." : data.error ?? "Hata");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <select
        className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
        value={episodeId}
        onChange={(e) => setEpisodeId(e.target.value)}
      >
        <option value="">Bölüm seç</option>
        {episodes.map((ep) => (
          <option key={ep.id} value={ep.id}>
            {ep.series} — {ep.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!episodeId}
        onClick={() => void submit()}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        Görünüm talep et
      </button>
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}

export function AcceptAppearanceButton({ appearanceId }: { appearanceId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function accept() {
    const res = await fetch("/api/bolumler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "member_accept", appearanceId }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Kabul edildi." : data.error ?? "Hata");
    router.refresh();
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => void accept()}
        className="rounded-md border border-[var(--line)] px-3 py-1 text-sm"
      >
        Öneriyi kabul et
      </button>
      {msg ? <p className="text-xs text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}
