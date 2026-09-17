"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Staff/host CTA for Kariyer Portresi default-host handoff. */
export function StaffHostHandoffButton({
  applicationId,
  mode,
}: {
  applicationId: string;
  mode: "send" | "resend";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sunucu/basvurular/${applicationId}/host-handoff`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        confirmation?: string;
        message?: string;
        alreadySent?: boolean;
      };
      if (!res.ok) {
        setConfirmation(null);
        setError(data.message ?? "Host’a mesaj gönderilemedi.");
        return;
      }
      setConfirmation(data.confirmation ?? "Host'a gönderildi");
      router.refresh();
    } catch {
      setConfirmation(null);
      setError("Host’a mesaj gönderilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={mode === "send" ? "btn btn-primary" : "btn btn-secondary"}
        disabled={busy}
        onClick={() => void send()}
      >
        {busy ? "Gönderiliyor…" : mode === "send" ? "Host'a gönder" : "Tekrar gönder"}
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
