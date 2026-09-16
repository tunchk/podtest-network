"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Invitation = {
  id: string;
  recipientEmail: string | null;
  purpose: string;
  episodeId: string | null;
  expiresAt: string;
  status: string;
  note: string | null;
};

type Episode = {
  id: string;
  series: string;
  title: string;
  publicationState: string;
};

type PendingAppearance = {
  id: string;
  member: { id: string; name: string; email: string };
  episode: { series: string; title: string };
};

export function AdminCommunityPanel({
  invitations: initialInvites,
  episodes: initialEpisodes,
  pendingAppearances,
}: {
  invitations: Invitation[];
  episodes: Episode[];
  pendingAppearances: PendingAppearance[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState<"SPEAKER_STATUS" | "EPISODE_ASSOCIATION">(
    "SPEAKER_STATUS",
  );
  const [episodeId, setEpisodeId] = useState("");
  const [series, setSeries] = useState("PodTest");
  const [title, setTitle] = useState("");
  const [listeningUrl, setListeningUrl] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function createInvite() {
    const res = await fetch("/api/davet/konusmaci", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        recipientEmail: email || undefined,
        purpose,
        episodeId: purpose === "EPISODE_ASSOCIATION" ? episodeId : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Hata");
      return;
    }
    setLink(data.acceptPath);
    setMsg("Davet oluşturuldu. Bağlantıyı kopyala; gerçek e-posta gönderilmez.");
    router.refresh();
  }

  async function revoke(id: string) {
    await fetch("/api/davet/konusmaci", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke", invitationId: id }),
    });
    router.refresh();
  }

  async function createEpisode(publish: boolean) {
    const res = await fetch("/api/bolumler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_episode",
        series,
        title,
        listeningUrl: listeningUrl || undefined,
        publicationState: publish ? "PUBLISHED" : "DRAFT",
        publicationDate: publish ? new Date().toISOString() : undefined,
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? `Bölüm: ${data.episode.id}` : data.error ?? "Hata");
    router.refresh();
  }

  async function verifyAppearance(id: string) {
    await fetch("/api/bolumler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "admin_verify", appearanceId: id }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Konuşmacı davetleri</h2>
        <p className="text-sm text-[var(--muted)]">
          Jetonlar hash olarak saklanır. Personel/sunucu yetkisi verilmez. Gerçek davet e-postası
          gönderilmez.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
            placeholder="Alıcı e-posta (isteğe bağlı)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as typeof purpose)}
          >
            <option value="SPEAKER_STATUS">Konuşmacı katılımı</option>
            <option value="EPISODE_ASSOCIATION">Bölüm ilişkilendirme</option>
          </select>
          {purpose === "EPISODE_ASSOCIATION" ? (
            <select
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm sm:col-span-2"
              value={episodeId}
              onChange={(e) => setEpisodeId(e.target.value)}
            >
              <option value="">Bölüm</option>
              {initialEpisodes.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  [{ep.publicationState}] {ep.series} — {ep.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void createInvite()}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
        >
          Davet oluştur
        </button>
        {link ? (
          <p className="break-all rounded-md bg-[var(--surface)] p-2 font-mono text-xs">{link}</p>
        ) : null}
        <ul className="space-y-2 text-sm">
          {initialInvites.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
              <span>
                {inv.purpose} · {inv.status} · {inv.recipientEmail ?? "e-posta yok"}
              </span>
              {inv.status === "OPEN" ? (
                <button type="button" className="underline" onClick={() => void revoke(inv.id)}>
                  İptal
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Podcast bölümleri</h2>
        <p className="text-sm text-[var(--muted)]">
          Gerçek PodTest dizi adlarını koru. Uydurma bölüm/tarih/konuk ekleme.
        </p>
        <input
          className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
          value={series}
          onChange={(e) => setSeries(e.target.value)}
          placeholder="Dizi"
        />
        <input
          className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Başlık"
        />
        <input
          className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
          value={listeningUrl}
          onChange={(e) => setListeningUrl(e.target.value)}
          placeholder="Dinleme URL (https)"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void createEpisode(false)}
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          >
            Taslak kaydet
          </button>
          <button
            type="button"
            onClick={() => void createEpisode(true)}
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
          >
            Yayımlayarak oluştur
          </button>
        </div>
        <ul className="text-sm text-[var(--muted)]">
          {initialEpisodes.map((ep) => (
            <li key={ep.id}>
              [{ep.publicationState}] {ep.series} — {ep.title}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Bekleyen görünümler</h2>
        {pendingAppearances.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Bekleyen yok.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {pendingAppearances.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {p.member.name} ({p.member.email}) · {p.episode.series} — {p.episode.title}
                </span>
                <button
                  type="button"
                  className="underline"
                  onClick={() => void verifyAppearance(p.id)}
                >
                  Doğrula
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}
