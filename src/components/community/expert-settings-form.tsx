"use client";

import { useState } from "react";

export function ExpertSettingsForm({
  initial,
}: {
  initial: {
    expertDiscussionAreas: string;
    acceptTargetedQuestions: boolean;
    consultationUrl: string;
    consultationPaid: boolean;
    showAppearancesOnProfile: boolean;
  };
}) {
  const [areas, setAreas] = useState(initial.expertDiscussionAreas);
  const [accept, setAccept] = useState(initial.acceptTargetedQuestions);
  const [url, setUrl] = useState(initial.consultationUrl);
  const [paid, setPaid] = useState(initial.consultationPaid);
  const [showApp, setShowApp] = useState(initial.showAppearancesOnProfile);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const res = await fetch("/api/uzman", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "settings",
        expertDiscussionAreas: areas
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        acceptTargetedQuestions: accept,
        consultationUrl: url || null,
        consultationPaid: paid,
        showAppearancesOnProfile: showApp,
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Kaydedildi." : data.error ?? "Hata");
  }

  return (
    <div className="panel space-y-3">
      <h2 className="font-[family-name:var(--font-display)] text-xl">Uzman ayarları</h2>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Konuşmaya açık alanlar (virgülle)</span>
        <input
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
          value={areas}
          onChange={(e) => setAreas(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
        Hedefli topluluk sorularını kabul et
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Harici danışmanlık URL (isteğe bağlı)</span>
        <input
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
        Bu danışmanlık ücretlidir (açıkça belirt)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showApp} onChange={(e) => setShowApp(e.target.checked)} />
        Onaylı podcast görünümlerini profilimde göster
      </label>
      <button
        type="button"
        onClick={() => void save()}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white"
      >
        Kaydet
      </button>
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}
