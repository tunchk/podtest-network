"use client";

import { useState } from "react";

/**
 * READY-only CTA on the guest producer-notes page.
 * Sends one internal message to the fixed default host.
 */
export function HostHandoffButton() {
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/arayanlar/host-handoff", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        confirmation?: string;
        message?: string;
        error?: string;
        alreadySent?: boolean;
      };
      if (!res.ok) {
        setConfirmation(null);
        setError(data.message ?? "Host’a mesaj gönderilemedi.");
        return;
      }
      setConfirmation(data.confirmation ?? "Host'a gönderildi");
    } catch {
      setConfirmation(null);
      setError("Host’a mesaj gönderilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="print:hidden space-y-2">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => void send()}
      >
        {busy ? "Gönderiliyor…" : "Host'a mesaj at"}
      </button>
      {confirmation ? (
        <p className="text-sm text-[var(--muted)]" role="status">
          {confirmation}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
