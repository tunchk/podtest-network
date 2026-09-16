import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listActiveWorkspacesForUser } from "@/lib/hiring/access";
import { EmployerCandidatesPanel } from "@/components/hiring/employer-candidates-panel";
import { PodTestPlusSoon } from "@/components/hiring/podtest-plus-soon";

type SearchParams = Promise<{
  ws?: string;
  skill?: string;
  location?: string;
  text?: string;
  openToWork?: string;
  openToProjects?: string;
  workPreferences?: string;
}>;

export default async function IsverenAdaylarPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const sp = await searchParams;
  const workspaces = await listActiveWorkspacesForUser(session.user.id);
  const wsId = sp.ws ?? workspaces[0]?.id;
  if (!wsId) redirect("/isveren");

  return (
    <section className="space-y-6">
      <Link href="/isveren" className="text-sm text-[var(--muted)] hover:underline">
        ← İşveren
      </Link>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Aday arama</h1>
      <p className="text-sm text-[var(--muted)]">
        Yalnızca onaylı, yayımlanmış ve keşfedilebilir profil alanları gösterilir. Korunan özniteliklere
        göre filtre veya gizli puanlama yoktur.
      </p>
      <PodTestPlusSoon />
      <EmployerCandidatesPanel
        workspaceId={wsId}
        initialFilters={{
          skill: sp.skill ?? "",
          location: sp.location ?? "",
          text: sp.text ?? "",
          workPreferences: sp.workPreferences ?? "",
          openToWork: sp.openToWork === "true",
          openToProjects: sp.openToProjects === "true",
        }}
      />
    </section>
  );
}
