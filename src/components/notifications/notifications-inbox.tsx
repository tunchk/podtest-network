"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Destination =
  | { available: true; href: string }
  | { available: false; reason: string };

type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  destination: Destination;
};

export function NotificationsInbox() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/bildirimler");
      if (!res.ok) throw new Error("Yüklenemedi");
      const data = await res.json();
      setItems(data.items ?? []);
      setNextCursor(data.nextCursor ?? null);
      setUnread(data.unreadCount ?? 0);
    } catch {
      setError("Bildirimler yüklenemedi. Yeniden deneyin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 7000);
    return () => clearInterval(t);
  }, [refresh]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/bildirimler?cursor=${encodeURIComponent(nextCursor)}`);
      if (!res.ok) throw new Error("Yüklenemedi");
      const data = await res.json();
      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setNextCursor(data.nextCursor ?? null);
      setUnread(data.unreadCount ?? 0);
    } catch {
      setError("Daha fazla bildirim yüklenemedi.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function markOne(id: string) {
    const res = await fetch("/api/bildirimler", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", notificationId: id }),
    });
    if (res.ok) {
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
      );
      setUnread((u) => Math.max(0, u - 1));
    }
  }

  async function markAll() {
    const res = await fetch("/api/bildirimler", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    if (res.ok) {
      setItems((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
      );
      setUnread(0);
    }
  }

  if (loading) return <p className="text-sm text-[var(--muted)]">Yükleniyor…</p>;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="panel space-y-2 text-sm">
          <p className="text-red-700">{error}</p>
          <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>
            Yeniden dene
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {unread > 0 ? `${unread} okunmamış bildirim` : "Okunmamış bildirim yok"}
        </p>
        {unread > 0 ? (
          <button type="button" className="btn btn-ghost text-sm" onClick={() => void markAll()}>
            Tümünü okundu işaretle
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="panel space-y-2 text-sm text-[var(--muted)]">
          <p className="font-medium text-[var(--ink)]">Henüz bildirimin yok</p>
          <p>
            Yeni mesaj istekleri, profil inceleme sonuçları ve benzeri gelişmeler burada görünür. Eski
            olaylar için geriye dönük bildirim oluşturulmaz.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li
              key={n.id}
              className={`panel space-y-2 ${n.readAt ? "opacity-80" : "border-[var(--accent)]/30"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--ink)]">{n.title}</p>
                  {n.body ? <p className="mt-1 text-sm text-[var(--muted)]">{n.body}</p> : null}
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {new Date(n.createdAt).toLocaleString("tr-TR")}
                    {!n.readAt ? " · Okunmadı" : ""}
                  </p>
                </div>
                {!n.readAt ? (
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={() => void markOne(n.id)}
                  >
                    Okundu
                  </button>
                ) : null}
              </div>
              {n.destination.available ? (
                <Link
                  href={n.destination.href}
                  className="inline-flex text-sm text-[var(--accent)] hover:underline"
                  onClick={() => {
                    if (!n.readAt) void markOne(n.id);
                  }}
                >
                  Git
                </Link>
              ) : (
                <p className="text-sm text-[var(--muted)]">{n.destination.reason}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Yükleniyor…" : "Daha fazla"}
        </button>
      ) : null}
    </div>
  );
}
