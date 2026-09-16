"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function VerifyPanel() {
  const search = useSearchParams();
  const [token, setToken] = useState(search.get("token") ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinkHint, setSinkHint] = useState<string | null>(null);

  async function request() {
    setError(null);
    const res = await fetch("/api/hesabim/eposta-dogrula", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Hata");
      return;
    }
    if (data.alreadyVerified) {
      setMsg("E-posta zaten doğrulanmış.");
      return;
    }
    setSinkHint(data.verifyPath ?? null);
    setMsg(
      "Yerel posta kutusu (mail-sink) dosyası yazıldı. Gerçek e-posta gönderilmedi. Aşağıdaki yolu kullan veya jetonu yapıştır.",
    );
    if (data.verifyPath?.includes("token=")) {
      setToken(String(data.verifyPath).split("token=")[1] ?? "");
    }
  }

  async function confirm() {
    setError(null);
    const res = await fetch("/api/hesabim/eposta-dogrula", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", token }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Hata");
      return;
    }
    setMsg("E-posta doğrulandı.");
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => void request()}
        className="rounded-md border border-[var(--line)] px-4 py-2 text-sm"
      >
        Doğrulama jetonu oluştur (yerel mail-sink)
      </button>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Jeton</span>
        <input
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-mono text-sm"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={() => void confirm()}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
      >
        Doğrula
      </button>
      {sinkHint ? <p className="text-xs text-[var(--muted)]">Yol: {sinkHint}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}

export default function EmailVerifyPage() {
  return (
    <section className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">E-posta doğrulama</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Konuşmacı daveti e-posta ile bağlıysa, kabul için hesabın e-postasının doğrulanmış olması
          gerekir. Bu ortamda gerçek e-posta gönderilmez; jetonlar yerel mail-sink dosyasına yazılır.
          İstemcinin “doğrulandı” iddiası kabul edilmez.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm">Yükleniyor…</p>}>
        <VerifyPanel />
      </Suspense>
    </section>
  );
}
