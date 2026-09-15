"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Message = {
  id: string;
  senderId: string;
  body: string | null;
  createdAt: string;
  deliveryStatus: string;
};

export function ConversationView(props: {
  conversationId: string;
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [peerName, setPeerName] = useState("Üye");
  const [peerId, setPeerId] = useState<string | null>(null);
  const [state, setState] = useState("ACTIVE");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/mesajlar/konusmalar/${props.conversationId}`);
    if (!res.ok) {
      setError("Konuşma yüklenemedi");
      return;
    }
    const data = await res.json();
    setMessages((data.messages ?? []).slice().reverse());
    setPeerName(data.peer?.displayName ?? "Üye");
    setPeerId(data.peer?.userId ?? null);
    setState(data.conversation?.messagingState ?? "ACTIVE");
    const latest = data.messages?.[0];
    if (latest) {
      await fetch(`/api/mesajlar/konusmalar/${props.conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", messageId: latest.id }),
      });
    }
  }, [props.conversationId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const key = `msg-${props.conversationId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await fetch(`/api/mesajlar/konusmalar/${props.conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", text, idempotencyKey: key }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Gönderilemedi");
      return;
    }
    if (data.kind === "held") {
      setError("Mesaj inceleme için bekletildi; alıcıya iletilmedi.");
      setText("");
      return;
    }
    setText("");
    await refresh();
  }

  async function block() {
    await fetch(`/api/mesajlar/konusmalar/${props.conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "block" }),
    });
    await refresh();
  }

  async function resumeRequest() {
    if (!peerId) return;
    const key = `resume-${props.conversationId}-${Date.now()}`;
    const res = await fetch("/api/mesajlar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_request",
        recipientId: peerId,
        introduction: "Konuşmaya devam etmek istiyorum.",
        idempotencyKey: key,
        isResumption: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "İstek gönderilemedi");
    else setError("Devam isteği gönderildi.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl">{peerName}</h1>
          <p className="text-sm text-[var(--muted)]">
            {state === "PAUSED" ? "Mesajlaşma duraklatıldı" : "Özel konuşma"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/mesajlar" className="btn btn-ghost">
            Gelen kutusu
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => void block()}>
            Engelle
          </button>
        </div>
      </div>

      <div className="panel max-h-[28rem] space-y-3 overflow-y-auto text-sm">
        {messages.length === 0 ? (
          <p className="text-[var(--muted)]">Henüz mesaj yok.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.senderId === props.currentUserId ? "text-right" : "text-left"
              }
            >
              <p
                className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 ${
                  m.senderId === props.currentUserId
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[color-mix(in_oklab,var(--surface)_80%,var(--line))]"
                }`}
              >
                {m.body}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {new Date(m.createdAt).toLocaleString("tr-TR")}
              </p>
            </div>
          ))
        )}
      </div>

      {state === "PAUSED" ? (
        <div className="panel space-y-2 text-sm">
          <p className="text-[var(--muted)]">
            Engelleme veya duraklatma sonrası mesajlaşma otomatik açılmaz. Devam için istek gönderin.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void resumeRequest()}>
            Devam isteği gönder
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <textarea
            className="min-h-[5rem] min-w-[16rem] flex-1 rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            value={text}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            placeholder="Mesaj yaz…"
            disabled={busy}
          />
          <button
            type="button"
            className="btn btn-primary self-end"
            disabled={busy || !text.trim()}
            onClick={() => void send()}
          >
            Gönder
          </button>
        </div>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
