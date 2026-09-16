"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AnswerForm({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!acknowledged) {
      setError("Yayımlamadan önce kamuya açıklık uyarısını onayla.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const createRes = await fetch("/api/topluluk/cevaplar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", questionId, body }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        setError(created.error ?? "Hata");
        return;
      }
      const submitRes = await fetch("/api/topluluk/cevaplar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          answerId: created.answer.id,
          idempotencyKey: `ui-ans-${created.answer.id}`,
        }),
      });
      const submitted = await submitRes.json();
      if (!submitRes.ok) {
        setError(submitted.error ?? "Hata");
        return;
      }
      if (submitted.answer.status === "PUBLISHED") {
        setBody("");
        router.refresh();
        return;
      }
      setMsg(submitted.answer.moderationReason ?? "Gönderildi; inceleme bekliyor olabilir.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Cevabın (düz metin)</span>
        <textarea
          className="mt-1 min-h-28 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <span>
          Cevabım ve görünen adım herkese açık olacak (profilim yayımlanmamış olsa bile).
        </span>
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
      <button
        type="button"
        disabled={pending || !body.trim()}
        onClick={() => void submit()}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Cevapla
      </button>
    </div>
  );
}
