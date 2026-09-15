"use client";

import { useState } from "react";

export function AdminAssignPanel() {
  const [applicationId, setApplicationId] = useState("");
  const [hostEmail, setHostEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function grantHost() {
    setMessage(null);
    const res = await fetch("/api/admin/arayanlar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "grant_host", hostEmail }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Sunucu yetkisi verildi." : data.error ?? "Hata");
  }

  async function assign() {
    setMessage(null);
    const res = await fetch("/api/admin/arayanlar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", applicationId, hostEmail }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Atama güncellendi." : data.error ?? "Hata");
  }

  return (
    <div className="panel space-y-3 text-sm">
      <h2 className="font-[family-name:var(--font-display)] text-lg">Yönetici — atama</h2>
      <label className="block">
        Sunucu e-postası
        <input
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
          value={hostEmail}
          onChange={(e) => setHostEmail(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => void grantHost()}>
          Sunucu yetkisi ver
        </button>
      </div>
      <label className="block">
        Başvuru kimliği
        <input
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
          value={applicationId}
          onChange={(e) => setApplicationId(e.target.value)}
        />
      </label>
      <button type="button" className="btn btn-primary" onClick={() => void assign()}>
        Başvuruya ata / yeniden ata
      </button>
      {message ? <p className="text-[var(--muted)]">{message}</p> : null}
    </div>
  );
}
