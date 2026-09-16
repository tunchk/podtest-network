"use client";

import { useState } from "react";

export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: "COMMUNITY_QUESTION" | "COMMUNITY_ANSWER" | "EXPERT_FAQ";
  targetId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [explanation, setExplanation] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    const res = await fetch("/api/topluluk/rapor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, reasonCode: reason, explanation }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Hata");
      return;
    }
    setMsg("Rapor alındı.");
    setOpen(false);
  }

  return (
    <div className="text-sm">
      <button
        type="button"
        className="text-[var(--muted)] underline-offset-2 hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        Bildir
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-md border border-[var(--line)] p-3">
          <select
            className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="spam">Spam</option>
            <option value="harassment">Taciz</option>
            <option value="scam">Dolandırıcılık</option>
            <option value="other">Diğer</option>
          </select>
          <textarea
            className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1"
            placeholder="Kısa açıklama (isteğe bağlı)"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void submit()}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-white"
          >
            Gönder
          </button>
        </div>
      ) : null}
      {msg ? <p className="mt-1 text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}
