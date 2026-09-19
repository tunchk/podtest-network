"use client";

import { useRef, useState } from "react";
import { LegalCheckbox } from "@/components/legal/legal-checkbox";
import { LEGAL_COPY } from "@/lib/legal/copy";

type UploadPhase = "idle" | "uploading" | "extracted" | "upload_failed" | "extraction_failed";

/**
 * Shared private CV upload control (file or paste) via existing `/api/cv`.
 * Does not start profile-prepare or Arayanlar prep jobs.
 */
export function CvUploadControl({
  onUploaded,
  idPrefix = "cv-upload",
  compact = false,
}: {
  onUploaded?: (doc: {
    id: string;
    originalFilename?: string;
    extractedTextChars?: number;
  }) => void;
  idPrefix?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [cvNoticeAck, setCvNoticeAck] = useState(false);
  const [cvAiDisclosure, setCvAiDisclosure] = useState(false);
  const [cvAiConsent, setCvAiConsent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lock = useRef(false);

  async function onUpload(file: File) {
    if (lock.current) return;
    if (!cvNoticeAck || !cvAiDisclosure) {
      setMessage("CV yüklemeden önce aydınlatma ve AI bilgilendirme kutularını işaretleyin.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage(null);
    setPhase("uploading");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("cvNoticeAck", "true");
      form.append("cvAiDisclosure", "true");
      form.append("cvAiConsent", cvAiConsent ? "true" : "false");
      const res = await fetch("/api/cv", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPhase(data.phase === "extraction" ? "extraction_failed" : "upload_failed");
        setMessage(data.message ?? "Yükleme başarısız.");
        return;
      }
      setPhase("extracted");
      setMessage(
        `CV yüklendi ve metin çıkarıldı (${data.extractedTextChars ?? 0} karakter).`,
      );
      onUploaded?.({
        id: data.documentId,
        originalFilename: file.name,
        extractedTextChars: data.extractedTextChars,
      });
    } catch {
      setPhase("upload_failed");
      setMessage("Yükleme sırasında ağ hatası oluştu. Yeniden deneyin.");
    } finally {
      setBusy(false);
      lock.current = false;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onPaste() {
    if (lock.current || !paste.trim()) return;
    if (!cvNoticeAck || !cvAiDisclosure) {
      setMessage("CV kaydetmeden önce aydınlatma ve AI bilgilendirme kutularını işaretleyin.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage(null);
    setPhase("uploading");
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: paste,
          cvNoticeAck: true,
          cvAiDisclosure: true,
          cvAiConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPhase(data.phase === "extraction" ? "extraction_failed" : "upload_failed");
        setMessage(data.message ?? "Metin kaydedilemedi.");
        return;
      }
      setPhase("extracted");
      setMessage("Yapıştırılan metin kaydedildi.");
      onUploaded?.({
        id: data.documentId,
        originalFilename: "yapıştırılan-metin.txt",
        extractedTextChars: data.extractedTextChars,
      });
      setPaste("");
    } catch {
      setPhase("upload_failed");
      setMessage("Metin kaydı sırasında ağ hatası oluştu.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  const noticesOk = cvNoticeAck && cvAiDisclosure;

  return (
    <div className="space-y-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm">
      {!compact ? (
        <div>
          <p className="font-medium">CV yükle</p>
          <p className="mt-1 text-[var(--muted)]">
            Kariyer Portresi hazırlığı CV’nden yararlanır. Ham CV host ile paylaşılmaz; yalnızca
            onayladığın gerçekler ve türetilmiş notlar kullanılır.
          </p>
        </div>
      ) : null}

      <fieldset className="space-y-2 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
        <legend className="px-1 font-medium">CV gizlilik onayları</legend>
        <p className="text-[var(--muted)]">{LEGAL_COPY.cvLead}</p>
        <LegalCheckbox
          id={`${idPrefix}-notice`}
          label={LEGAL_COPY.cvNoticeAck}
          href="/yasal/cv_ai_processing_notice"
          checked={cvNoticeAck}
          onChange={setCvNoticeAck}
          required
        />
        <LegalCheckbox
          id={`${idPrefix}-ai-disc`}
          label={LEGAL_COPY.cvAiDisclosure}
          href="/yasal/cv_ai_processing_notice"
          checked={cvAiDisclosure}
          onChange={setCvAiDisclosure}
          required
        />
        <LegalCheckbox
          id={`${idPrefix}-ai-consent`}
          label={LEGAL_COPY.cvAiConsent}
          href="/yasal/cv_ai_consent"
          checked={cvAiConsent}
          onChange={setCvAiConsent}
        />
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="field mb-0">
          <label htmlFor={`${idPrefix}-file`}>PDF / DOCX yükle (en fazla 5 MB)</label>
          <input
            id={`${idPrefix}-file`}
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            disabled={busy || !noticesOk}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
            }}
          />
        </div>
        <div className="field mb-0">
          <label htmlFor={`${idPrefix}-paste`}>Metin yapıştır (alternatif)</label>
          <textarea
            id={`${idPrefix}-paste`}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="CV metnini buraya yapıştırın"
            disabled={busy || !noticesOk}
          />
          <button
            type="button"
            className="btn btn-ghost mt-2"
            disabled={busy || !paste.trim() || !noticesOk}
            onClick={() => void onPaste()}
          >
            Metni kaydet
          </button>
        </div>
      </div>

      {message ? (
        <p
          className={`text-sm ${
            phase.includes("failed") ? "text-[var(--danger)]" : "text-[var(--accent-strong)]"
          }`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
