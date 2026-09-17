"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { LegalCheckbox } from "@/components/legal/legal-checkbox";

type Preview = {
  title: string;
  description: string | null;
  artworkUrl: string | null;
};

type Props = {
  mode: "approval_requested" | "change_requested" | "published";
  preview: Preview;
  alreadyApproved?: boolean;
  changeNote?: string;
  publicUrl?: string;
};

export function CandidatePublicationPanel({
  mode,
  preview,
  alreadyApproved = false,
  changeNote,
  publicUrl,
}: Props) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(mode);
  const [localApproved, setLocalApproved] = useState(alreadyApproved);

  async function approve() {
    if (!checked || busy || localApproved) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/arayanlar/publication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        created?: boolean;
      };
      if (!res.ok) {
        setError(data.message ?? "Onay kaydedilemedi.");
        return;
      }
      setLocalApproved(true);
      setMsg(
        data.created === false
          ? "Bu sürüm için onayın zaten kayıtlı."
          : "Yayın onayı kaydedildi.",
      );
      router.refresh();
    } catch {
      setError("Onay kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function requestChanges() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/arayanlar/publication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_changes", note }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Talep gönderilemedi.");
        return;
      }
      setLocalMode("change_requested");
      setMsg("Değişiklik talebin iletildi");
      setChangeOpen(false);
      router.refresh();
    } catch {
      setError("Talep gönderilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (localMode === "published" && publicUrl) {
    const external = publicUrl.startsWith("http");
    return (
      <article className="panel space-y-3 text-sm">
        <h2 className="font-[family-name:var(--font-display)] text-lg">
          Kariyer Portresi yayında
        </h2>
        <p className="text-[var(--muted)]">Bölümün yayınlandı.</p>
        {external ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary inline-flex"
          >
            Bölümü aç
          </a>
        ) : (
          <Link href={publicUrl} className="btn btn-primary inline-flex">
            Bölümü aç
          </Link>
        )}
      </article>
    );
  }

  if (localMode === "change_requested") {
    return (
      <article className="panel space-y-3 text-sm">
        <h2 className="font-[family-name:var(--font-display)] text-lg">
          Değişiklik talebin iletildi
        </h2>
        <p className="text-[var(--muted)]">
          Ekip talebini gördü. Yeni bir yayın sürümü hazırlandığında tekrar onayına
          sunulacak.
        </p>
        {changeNote || note ? (
          <p className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--muted)]">
            {changeNote || note}
          </p>
        ) : null}
        <PreviewBlock preview={preview} />
      </article>
    );
  }

  return (
    <article className="panel space-y-4 text-sm">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg">
          Yayın onayın bekleniyor
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Kariyer Portresi bölümünün yayınlanacak versiyonu hazır. Yayınlanmadan önce
          bilgileri kontrol edip onaylamanı istiyoruz.
        </p>
      </div>

      <PreviewBlock preview={preview} />

      {localApproved ? (
        <p className="text-[var(--muted)]" role="status">
          Bu sürüm için yayın onayın kayıtlı. Yayınlandığında burada göreceksin.
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--muted)]">
            Kayıt izni yayın yetkisi vermez. Onay, bu sürüme bağlıdır.{" "}
            <Link href="/yasal/publication_approval" className="underline" target="_blank">
              Yayın onayı metni
            </Link>
          </p>
          <LegalCheckbox
            id="kariyer-pub-approve"
            label="Bölümün yayınlanmasını onaylıyorum."
            checked={checked}
            onChange={setChecked}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!checked || busy}
              onClick={() => void approve()}
            >
              {busy ? "Kaydediliyor…" : "Yayınlanmasını onaylıyorum"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setChangeOpen((v) => !v)}
            >
              Değişiklik istiyorum
            </button>
          </div>
          {changeOpen ? (
            <div className="space-y-2 rounded-md border border-[var(--line)] p-3">
              <label className="field mb-0">
                <span>Ne değiştirilmesini istersin?</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !note.trim()}
                onClick={() => void requestChanges()}
              >
                Talebi gönder
              </button>
            </div>
          ) : null}
        </>
      )}
      {msg ? (
        <p className="text-[var(--muted)]" role="status">
          {msg}
        </p>
      ) : null}
      {error ? (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

function PreviewBlock({ preview }: { preview: Preview }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {preview.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.artworkUrl}
          alt=""
          className="h-24 w-24 shrink-0 rounded-md object-cover"
        />
      ) : null}
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-[var(--ink)]">{preview.title}</p>
        {preview.description ? (
          <p className="text-[var(--muted)] whitespace-pre-wrap">{preview.description}</p>
        ) : null}
      </div>
    </div>
  );
}
