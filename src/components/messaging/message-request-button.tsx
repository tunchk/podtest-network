"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MessageRequestButton(props: { recipientUserId: string; recipientName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const key = `req-${props.recipientUserId}-${Date.now()}`;
    const res = await fetch("/api/mesajlar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_request",
        recipientId: props.recipientUserId,
        introduction: text,
        idempotencyKey: key,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(
        data.error === "QUOTA_EXCEEDED"
          ? "Aylık mesaj isteği hakkın doldu."
          : data.error === "REQUESTS_DISABLED"
            ? "Bu üye yeni istek kabul etmiyor."
            : data.error === "COOLDOWN_ACTIVE"
              ? "Bu kişi için bekleme süresi aktif."
              : data.error === "opposite_pending" || data.kind === "opposite_pending"
                ? "Karşı taraftan bekleyen bir istek var; Mesajlar’dan yanıtla."
                : data.error ?? "İstek gönderilemedi",
      );
      if (data.kind === "opposite_pending") {
        router.push("/mesajlar");
      }
      return;
    }
    if (data.kind === "open_conversation" && data.conversationId) {
      router.push(`/mesajlar/${data.conversationId}`);
      return;
    }
    if (data.kind === "opposite_pending") {
      router.push("/mesajlar");
      return;
    }
    if (data.kind === "held") {
      setError("İstek inceleme için bekletildi.");
      return;
    }
    setOpen(false);
    setText("");
    router.push("/mesajlar");
  }

  return (
    <div className="space-y-2">
      {!open ? (
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          Mesaj isteği gönder
        </button>
      ) : (
        <div className="panel space-y-2 text-sm">
          <p>
            <strong>{props.recipientName}</strong> için kısa bir tanıtım yaz (en fazla 1000 karakter).
          </p>
          <textarea
            className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
            rows={4}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !text.trim()}
              onClick={() => void submit()}
            >
              Gönder
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </button>
          </div>
          {error ? <p className="text-red-700">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
