"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LegalCheckbox } from "@/components/legal/legal-checkbox";

export function AppearanceRequestForm({
  episodes,
}: {
  episodes: Array<{ id: string; series: string; title: string }>;
}) {
  const router = useRouter();
  const [episodeId, setEpisodeId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    const res = await fetch("/api/bolumler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_appearance", episodeId }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Talep gönderildi (yönetici onayı bekleniyor)." : data.error ?? "Hata");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <select
        className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
        value={episodeId}
        onChange={(e) => setEpisodeId(e.target.value)}
      >
        <option value="">Bölüm seç</option>
        {episodes.map((ep) => (
          <option key={ep.id} value={ep.id}>
            {ep.series} — {ep.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!episodeId}
        onClick={() => void submit()}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        Görünüm talep et
      </button>
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}

export function AcceptAppearanceButton({ appearanceId }: { appearanceId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [recordingOk, setRecordingOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (!recordingOk || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const legal = await fetch("/api/yasal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          checked: true,
          type: "RECORDING",
          documentType: "RECORDING_CONSENT",
          scope: "appearance_accept",
          relatedResourceType: "episode_appearance",
          relatedResourceId: appearanceId,
        }),
      });
      if (!legal.ok) {
        const data = await legal.json();
        setMsg(data.message ?? data.error ?? "Kayıt izni kaydedilemedi.");
        return;
      }

      const res = await fetch("/api/bolumler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "member_accept", appearanceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(
          data.error === "LEGAL_RECORDING_REQUIRED"
            ? "Kayıt izni olmadan görünüm kabul edilemez."
            : (data.error ?? "Hata"),
        );
        return;
      }
      setMsg("Kabul edildi. Yayın için ayrıca yayın onayı gerekir.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-[var(--line)] p-3">
      <p className="text-xs text-[var(--muted)]">
        Kayıt izni yayın izni değildir. Yayın için bölüm sürümüne özel ayrı onay gerekir.{" "}
        <Link href="/yasal/recording_consent" className="underline" target="_blank">
          Kayıt metni
        </Link>
        {" · "}
        <Link href="/yasal/recording_and_publication_notice" className="underline" target="_blank">
          Kayıt ve yayın bilgilendirmesi
        </Link>
      </p>
      <LegalCheckbox
        id={`rec-${appearanceId}`}
        label="PodTest görüşmesinin sesli ve/veya görüntülü olarak kayıt altına alınacağını biliyorum ve kayıt yapılmasını onaylıyorum."
        checked={recordingOk}
        onChange={setRecordingOk}
        required
      />
      <button
        type="button"
        disabled={!recordingOk || busy}
        onClick={() => void accept()}
        className="rounded-md border border-[var(--line)] px-3 py-1 text-sm disabled:opacity-50"
      >
        {busy ? "Kaydediliyor…" : "Öneriyi kabul et"}
      </button>
      {msg ? <p className="text-xs text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}
