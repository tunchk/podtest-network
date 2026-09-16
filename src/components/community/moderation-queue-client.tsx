"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CaseRow = {
  id: string;
  report: {
    id: string;
    targetType: string;
    targetId: string;
    reasonCode: string;
    explanation: string | null;
    evidenceSnapshot: unknown;
  };
};

type HoldRow = {
  id: string;
  kind: string;
  createdAt: string;
  payload: unknown;
};

export function ModerationQueueClient({
  cases,
  holds,
}: {
  cases: CaseRow[];
  holds: HoldRow[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function act(body: Record<string, unknown>) {
    const res = await fetch("/api/moderasyon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setMsg(res.ok ? "Tamam." : data.error ?? "Hata");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Açık raporlar</h2>
        {cases.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Açık rapor yok.</p>
        ) : (
          <ul className="space-y-3">
            {cases.map((c) => (
              <li key={c.id} className="rounded-md border border-[var(--line)] p-3 text-sm">
                <p>
                  {c.report.targetType} · {c.report.reasonCode}
                </p>
                {c.report.explanation ? (
                  <p className="text-[var(--muted)]">{c.report.explanation}</p>
                ) : null}
                <pre className="mt-2 overflow-auto rounded bg-[var(--surface)] p-2 text-xs">
                  {JSON.stringify(c.report.evidenceSnapshot, null, 2)}
                </pre>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void act({ action: "dismiss", caseId: c.id })}
                  >
                    Reddet (kapat)
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void act({ action: "remove_content", caseId: c.id })}
                  >
                    İçeriği kaldır
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Bekletilen içerik</h2>
        {holds.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Bekletilen yok.</p>
        ) : (
          <ul className="space-y-3">
            {holds.map((h) => (
              <li key={h.id} className="rounded-md border border-[var(--line)] p-3 text-sm">
                <p>
                  {h.kind} · {new Date(h.createdAt).toLocaleString("tr-TR")}
                </p>
                <pre className="mt-2 overflow-auto rounded bg-[var(--surface)] p-2 text-xs">
                  {JSON.stringify(h.payload, null, 2)}
                </pre>
                <button
                  type="button"
                  className="mt-2 underline"
                  onClick={() => void act({ action: "release_hold", holdId: h.id })}
                >
                  Yayınla / serbest bırak
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}
