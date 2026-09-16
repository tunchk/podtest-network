"use client";

import { useState } from "react";

type Acceptance = {
  id: string;
  type: string;
  documentType: string;
  documentVersion: string;
  documentKey: string;
  acceptedAt: string;
  withdrawnAt: string | null;
  relatedResourceType: string | null;
  relatedResourceId: string | null;
  metadata: unknown;
};

/** Staff-only lookup of a member's legal acceptances. */
export function AdminLegalAudit() {
  const [userId, setUserId] = useState("");
  const [rows, setRows] = useState<Acceptance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setRows(null);
    const res = await fetch(`/api/yasal?userId=${encodeURIComponent(userId.trim())}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Yüklenemedi");
      return;
    }
    setRows(data.acceptances ?? []);
  }

  return (
    <section id="yasal-denetim" className="panel space-y-3">
      <h2 className="font-[family-name:var(--font-display)] text-xl">Yasal kabul denetimi</h2>
      <p className="text-sm text-[var(--muted)]">
        Üye kullanıcı kimliği ile sürümlenmiş kabul/rıza kayıtlarını görüntüle. Normal üyeler bu
        verilere erişemez.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[16rem] flex-1 rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          placeholder="userId"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          Getir
        </button>
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {rows ? (
        <ul className="max-h-80 space-y-2 overflow-auto text-sm">
          {rows.map((r) => (
            <li key={r.id} className="rounded border border-[var(--line)] px-3 py-2">
              <div>
                <strong>{r.type}</strong> · {r.documentKey}
              </div>
              <div className="text-xs text-[var(--muted)]">
                {new Date(r.acceptedAt).toLocaleString("tr-TR")}
                {r.withdrawnAt
                  ? ` · geri alındı ${new Date(r.withdrawnAt).toLocaleString("tr-TR")}`
                  : ""}
              </div>
              {r.relatedResourceId ? (
                <div className="text-xs">
                  {r.relatedResourceType}:{r.relatedResourceId}
                </div>
              ) : null}
            </li>
          ))}
          {!rows.length ? <li className="text-[var(--muted)]">Kayıt yok.</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
