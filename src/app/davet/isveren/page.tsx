"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AcceptEmployerInviteForm() {
  const search = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState(search.get("token") ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setError(null);
    const res = await fetch("/api/davet/isveren", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Hata");
      return;
    }
    setMsg(data.alreadyAccepted ? "Zaten kabul edilmiş." : "Çalışma alanına eklendin.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <input
        className="w-full rounded-md border border-[var(--line)] px-3 py-2 font-mono text-sm"
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
      <button type="button" onClick={() => void accept()} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white">
        Daveti kabul et
      </button>
    </div>
  );
}

export default function EmployerInvitePage() {
  return (
    <section className="mx-auto max-w-lg space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">İşveren daveti</h1>
      <p className="text-sm text-[var(--muted)]">
        Konuşmacı, sunucu veya personel yetkisi vermez. Gerçek e-posta gönderilmez.
      </p>
      <Suspense fallback={<p className="text-sm">Yükleniyor…</p>}>
        <AcceptEmployerInviteForm />
      </Suspense>
    </section>
  );
}
