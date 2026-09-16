"use client";

import { useState } from "react";
import Link from "next/link";
import { LegalCheckbox } from "@/components/legal/legal-checkbox";

type Props = {
  episodeId: string;
  episodeTitle: string;
  appearanceId: string;
};

export function PublicationApprovalPanel({ episodeId, episodeTitle, appearanceId }: Props) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);

  async function loadVersion() {
    const res = await fetch(`/api/bolumler?publicationVersion=1&episodeId=${episodeId}`);
    if (!res.ok) {
      setMsg("Sürüm bilgisi alınamadı.");
      return null;
    }
    const data = (await res.json()) as { publicationVersionId: string; alreadyApproved?: boolean };
    setVersionId(data.publicationVersionId);
    if (data.alreadyApproved) {
      setMsg("Bu sürüm için yayın onayın kayıtlı.");
    }
    return data;
  }

  async function approve() {
    if (!checked || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const preview = await loadVersion();
      if (!preview) return;
      if (preview.alreadyApproved) return;

      const res = await fetch("/api/yasal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          checked: true,
          type: "PUBLICATION",
          documentType: "PUBLICATION_APPROVAL",
          scope: "episode_publication",
          relatedResourceType: "podcast_episode",
          relatedResourceId: episodeId,
          metadata: {
            publicationVersionId: preview.publicationVersionId,
            appearanceId,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.message ?? data.error ?? "Onay kaydedilemedi.");
        return;
      }
      setMsg("Yayın onayı kaydedildi. Yönetim yayını bu sürüme bağlayabilir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-[var(--line)] p-3 text-sm">
      <p className="font-medium">Yayın onayı — {episodeTitle}</p>
      <p className="text-xs text-[var(--muted)]">
        Kayıt izni yayın yetkisi vermez. Onay, o anki bölüm sürümüne bağlıdır; önemli içerik
        değişikliğinde yeni onay gerekir.{" "}
        <Link href="/yasal/publication_approval" className="underline" target="_blank">
          Yayın onayı metni
        </Link>
      </p>
      <LegalCheckbox
        id={`pub-${episodeId}`}
        label="Bölümün yayınlanmasını onaylıyorum."
        checked={checked}
        onChange={setChecked}
      />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={!checked || busy}
        onClick={() => void approve()}
      >
        {busy ? "Kaydediliyor…" : "Yayın onayını kaydet"}
      </button>
      {versionId ? (
        <p className="text-xs text-[var(--muted)]">Sürüm kimliği: {versionId}</p>
      ) : null}
      {msg ? <p className="text-xs text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}
