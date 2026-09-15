"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type InboxItem = {
  conversationId: string;
  messagingState: string;
  unread: number;
  lastMessage: { preview: string; createdAt: string } | null;
  peer: { displayName: string; userId: string };
};

type RequestItem = {
  id: string;
  introduction: string;
  createdAt: string;
  status?: string;
  sender?: { displayName: string };
  recipient?: { displayName: string };
};

export function MessagingHub() {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [incoming, setIncoming] = useState<RequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<RequestItem[]>([]);
  const [quota, setQuota] = useState<{ remaining: number; allowance: number; resetAt: string } | null>(
    null,
  );
  const [acceptRequests, setAcceptRequests] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [reqRes, inboxRes] = await Promise.all([
        fetch("/api/mesajlar"),
        fetch("/api/mesajlar/konusmalar"),
      ]);
      if (!reqRes.ok || !inboxRes.ok) throw new Error("Yüklenemedi");
      const reqData = await reqRes.json();
      const inboxData = await inboxRes.json();
      setIncoming(reqData.incoming ?? []);
      setOutgoing(reqData.outgoing ?? []);
      setQuota(reqData.quota ?? null);
      setAcceptRequests(Boolean(reqData.preferences?.acceptMessageRequests));
      setInbox(inboxData.inbox ?? []);
    } catch {
      setError("Mesajlar yüklenemedi. Yeniden deneyin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  async function setPrefs(next: boolean) {
    const res = await fetch("/api/mesajlar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_preferences", acceptMessageRequests: next }),
    });
    if (res.ok) setAcceptRequests(next);
  }

  async function actOnRequest(id: string, action: string) {
    const res = await fetch(`/api/mesajlar/istek/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "İşlem başarısız");
      return;
    }
    if (action === "accept" && data.conversationId) {
      window.location.href = `/mesajlar/${data.conversationId}`;
      return;
    }
    await refresh();
  }

  if (loading) return <p className="text-sm text-[var(--muted)]">Yükleniyor…</p>;

  return (
    <div className="space-y-8">
      {error ? (
        <div className="panel space-y-2 text-sm">
          <p className="text-red-700">{error}</p>
          <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>
            Yeniden dene
          </button>
        </div>
      ) : null}

      <section className="panel space-y-3 text-sm">
        <h2 className="font-[family-name:var(--font-display)] text-lg">İletişim tercihleri</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={acceptRequests}
            onChange={(e) => void setPrefs(e.target.checked)}
          />
          Yeni mesaj isteklerini kabul et
        </label>
        {quota ? (
          <p className="text-[var(--muted)]">
            Bu ay kalan istek hakkı: <strong>{quota.remaining}</strong> / {quota.allowance}. Sıfırlanma:{" "}
            {new Date(quota.resetAt).toLocaleString("tr-TR", { timeZone: "UTC" })} UTC
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Gelen istekler</h2>
        {incoming.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Bekleyen istek yok.</p>
        ) : (
          <ul className="space-y-3">
            {incoming.map((r) => (
              <li key={r.id} className="panel space-y-2 text-sm">
                <p className="font-medium">{r.sender?.displayName}</p>
                <p className="whitespace-pre-wrap text-[var(--muted)]">{r.introduction}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" onClick={() => void actOnRequest(r.id, "accept")}>
                    Kabul et
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => void actOnRequest(r.id, "reject")}>
                    Reddet
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => void actOnRequest(r.id, "block")}>
                    Engelle
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Giden istekler</h2>
        {outgoing.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Giden istek yok.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {outgoing.map((r) => (
              <li key={r.id} className="panel flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{r.recipient?.displayName}</p>
                  <p className="text-[var(--muted)]">
                    {r.status} · {r.introduction.slice(0, 80)}
                  </p>
                </div>
                {r.status === "PENDING" ? (
                  <button type="button" className="btn btn-ghost" onClick={() => void actOnRequest(r.id, "cancel")}>
                    İptal
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Konuşmalar</h2>
        {inbox.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Henüz konuşma yok.</p>
        ) : (
          <ul className="space-y-2">
            {inbox.map((item) => (
              <li key={item.conversationId}>
                <Link
                  href={`/mesajlar/${item.conversationId}`}
                  className="panel flex items-center justify-between gap-3 text-sm hover:bg-[color-mix(in_oklab,var(--surface)_90%,var(--accent)_10%)]"
                >
                  <div>
                    <p className="font-medium">
                      {item.peer.displayName}
                      {item.unread > 0 ? (
                        <span className="ml-2 badge">{item.unread} yeni</span>
                      ) : null}
                    </p>
                    <p className="text-[var(--muted)]">
                      {item.messagingState === "PAUSED" ? "Duraklatıldı · " : ""}
                      {item.lastMessage?.preview ?? "Henüz mesaj yok"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
