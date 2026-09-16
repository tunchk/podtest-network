import Link from "next/link";
import { getCurrentDocument, ensureLegalDocumentsSeeded } from "@/lib/legal/service";
import type { LegalDocumentType } from "@/generated/prisma/client";
import { LEGAL_CONTROLLER_PLACEHOLDERS } from "@/lib/legal/documents";

type Params = Promise<{ type: string }>;

const ALLOWED = new Set<string>([
  "TERMS_OF_SERVICE",
  "PRIVACY_NOTICE",
  "CV_AI_PROCESSING_NOTICE",
  "CV_AI_CONSENT",
  "PROFILE_VISIBILITY_NOTICE",
  "HOST_PREP_SHARING_NOTICE",
  "RECORDING_CONSENT",
  "PUBLICATION_APPROVAL",
  "MARKETING_CONSENT",
  "RECORDING_AND_PUBLICATION_NOTICE",
]);

export default async function LegalDocumentPage({ params }: { params: Params }) {
  const { type: raw } = await params;
  const type = raw.toUpperCase().replace(/-/g, "_");
  if (!ALLOWED.has(type)) {
    return (
      <div className="panel space-y-3">
        <h1 className="text-2xl">Belge bulunamadı</h1>
        <Link href="/" className="underline">
          Ana sayfa
        </Link>
      </div>
    );
  }

  await ensureLegalDocumentsSeeded();
  const doc = await getCurrentDocument(type as LegalDocumentType);

  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <p className="text-xs text-[var(--muted)]">
        Sürüm {doc.version} · Taslak — üretim öncesi danışman incelemesi gerekir. Veri sorumlusu:{" "}
        {LEGAL_CONTROLLER_PLACEHOLDERS.legalName}
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">{doc.title}</h1>
      {doc.summary ? <p className="text-[var(--muted)]">{doc.summary}</p> : null}
      <div className="prose prose-sm max-w-none whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-relaxed">
        {doc.bodyMarkdown}
      </div>
      <Link href="/yasal" className="text-sm text-[var(--accent)] underline">
        Tüm belgeler
      </Link>
    </article>
  );
}
