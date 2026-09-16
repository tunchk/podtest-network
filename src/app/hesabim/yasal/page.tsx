import { requireSession } from "@/lib/session";
import { AccountLegalPreferences } from "@/components/legal/account-legal-preferences";
import Link from "next/link";

export default async function AccountLegalPage() {
  await requireSession();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">Yasal tercihler</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Kabul ve rızalar sürümlenir; geri alma ileriye etkilidir.{" "}
          <Link href="/yasal" className="underline">
            Taslak belgeler
          </Link>
        </p>
      </div>
      <AccountLegalPreferences />
    </div>
  );
}
