import Link from "next/link";
import { CURRENT_LEGAL_DOCUMENTS, LEGAL_CONTROLLER_PLACEHOLDERS } from "@/lib/legal/documents";
import { ensureLegalDocumentsSeeded } from "@/lib/legal/service";

export default async function LegalIndexPage() {
  await ensureLegalDocumentsSeeded();
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">Yasal ve gizlilik</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Aşağıdaki metinler ürün/hukuk taslağıdır; üretim yayını öncesi danışman incelemesi gerekir.
          Veri sorumlusu yer tutucuları: {LEGAL_CONTROLLER_PLACEHOLDERS.legalName},{" "}
          {LEGAL_CONTROLLER_PLACEHOLDERS.address}, {LEGAL_CONTROLLER_PLACEHOLDERS.privacyEmail}.
        </p>
      </div>
      <ul className="space-y-3">
        {CURRENT_LEGAL_DOCUMENTS.map((doc) => (
          <li key={doc.type} className="rounded-lg border border-[var(--line)] p-4">
            <Link
              href={`/yasal/${doc.type.toLowerCase()}`}
              className="font-medium text-[var(--accent)] underline"
            >
              {doc.title}
            </Link>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {doc.summary} · sürüm {doc.version}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
