import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listActiveWorkspacesForUser } from "@/lib/hiring/access";
import { listWorkspaceJobs } from "@/lib/hiring/jobs";
import { EmployerJobsPanel } from "@/components/hiring/employer-jobs-panel";
import { PodTestPlusSoon } from "@/components/hiring/podtest-plus-soon";

type SearchParams = Promise<{ ws?: string }>;

export default async function IsverenIlanlarPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const sp = await searchParams;
  const workspaces = await listActiveWorkspacesForUser(session.user.id);
  const wsId = sp.ws ?? workspaces[0]?.id;
  if (!wsId) redirect("/isveren");

  const jobs = await listWorkspaceJobs(session.user.id, wsId);

  return (
    <section className="space-y-6">
      <Link href="/isveren" className="text-sm text-[var(--muted)] hover:underline">
        ← İşveren
      </Link>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">İlanlar</h1>
      <PodTestPlusSoon />
      <EmployerJobsPanel
        workspaceId={wsId}
        jobs={jobs.map((j) => ({ id: j.id, title: j.title, status: j.status, slug: j.slug }))}
      />
    </section>
  );
}
