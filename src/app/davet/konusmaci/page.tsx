"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AcceptForm() {
  const search = useSearchParams();
  const router = useRouter();
  const initial = search.get("token") ?? "";
  const [token, setToken] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function accept() {
    setPending(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/davet/konusmaci", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "EMAIL_NOT_VERIFIED"
            ? "Davet e-posta ile bağlı; önce e-postanı doğrula."
            : data.error === "WRONG_ACCOUNT"
              ? "Bu davet başka bir e-posta adresine bağlı."
              : (data.error ?? "Hata"),
        );
        return;
      }
      setMsg(
        data.alreadyAccepted
          ? "Davet zaten kabul edilmiş."
          : "Davet kabul edildi. Konuşmacı katılımı aktif (personel/sunucu yetkisi verilmez).",
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Davet kodu</span>
        <input
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-mono text-sm"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
      {error === "Davet e-posta ile bağlı; önce e-postanı doğrula." ||
      error === "EMAIL_NOT_VERIFIED" ? (
        <a href="/hesabim/eposta-dogrula" className="text-sm underline">
          E-posta doğrulamaya git
        </a>
      ) : null}
      <button
        type="button"
        disabled={pending || !token.trim()}
        onClick={() => void accept()}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Daveti kabul et
      </button>
    </div>
  );
}

export default function SpeakerInvitePage() {
  return (
    <section className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">Konuşmacı daveti</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Tek kullanımlık, süresi dolan davet. Personel, moderatör, sunucu çalışma alanı veya ücretli
          plan yetkisi vermez. Mesleki yeterlilik doğrulaması değildir.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Yükleniyor…</p>}>
        <AcceptForm />
      </Suspense>
    </section>
  );
}
