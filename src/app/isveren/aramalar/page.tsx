import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listActiveWorkspacesForUser } from "@/lib/hiring/access";
import { listHiringSavedSearches } from "@/lib/hiring/candidates";
import { SavedSearchesList } from "@/components/hiring/saved-searches-list";
import { PodTestPlusSoon } from "@/components/hiring/podtest-plus-soon";

type SearchParams = Promise<{ ws?: string }>;

export default async function IsverenAramalarPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const sp = await searchParams;
  const workspaces = await listActiveWorkspacesForUser(session.user.id);
  const wsId = sp.ws ?? workspaces[0]?.id;
  if (!wsId) redirect("/isveren");

  const searches = await listHiringSavedSearches(session.user.id, wsId);

  return (
    <section className="space-y-6">
      <Link href="/isveren" className="text-sm text-[var(--muted)] hover:underline">
        ← İşveren
      </Link>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Kayıtlı aramalar</h1>
      <p className="text-sm text-[var(--muted)]">
        Filtreler saklanır; profil verisi kopyalanmaz. Yeniden aç, aday aramasına filtreleri taşır.
      </p>
      <PodTestPlusSoon />
      <SavedSearchesList
        workspaceId={wsId}
        searches={searches.map((s) => ({ id: s.id, name: s.name, filters: s.filters }))}
      />
    </section>
  );
}
