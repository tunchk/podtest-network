import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listActiveWorkspacesForUser } from "@/lib/hiring/access";
import { countActivePublishedJobs, listWorkspaceJobs } from "@/lib/hiring/jobs";
import { listWorkspaceMembers } from "@/lib/hiring/workspace";
import { HIRING_ACTIVE_JOBS_PER_WORKSPACE } from "@/lib/hiring/constants";
import { evaluateUserCapability } from "@/lib/capabilities/evaluate";
import { isMessagingTemporarilyRestricted } from "@/lib/messaging/preferences";
import { EmployerJobsPanel } from "@/components/hiring/employer-jobs-panel";
import { PodTestPlusSoon } from "@/components/hiring/podtest-plus-soon";
import { ui } from "@/lib/ui-copy";

type SearchParams = Promise<{ ws?: string }>;

export default async function IsverenIlanlarPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const sp = await searchParams;
  const workspaces = await listActiveWorkspacesForUser(session.user.id);
  const wsId = sp.ws ?? workspaces[0]?.id;
  if (!wsId) redirect("/isveren");

  const membership = workspaces.find((w) => w.id === wsId);
  if (!membership) redirect("/isveren");

  const [jobs, members, publishCap, activePublished] = await Promise.all([
    listWorkspaceJobs(session.user.id, wsId),
    listWorkspaceMembers(session.user.id, wsId),
    evaluateUserCapability(session.user.id, "hiring.job.publish"),
    countActivePublishedJobs(wsId),
  ]);

  const eligibleContacts = (
    await Promise.all(
      members.map(async (m) => {
        const restricted = await isMessagingTemporarilyRestricted(m.userId);
        return {
          userId: m.userId,
          role: m.role,
          name: m.user.name,
          email: m.user.email,
          messagingAvailable: !restricted,
        };
      }),
    )
  ).filter((m) => m.messagingAvailable);

  const slotsExhausted = activePublished >= HIRING_ACTIVE_JOBS_PER_WORKSPACE;
  const canCreate = publishCap.allowed && !slotsExhausted;

  return (
    <section className="space-y-6">
      <Link href="/isveren" className="text-sm text-[var(--muted)] hover:underline">
        ← İşveren
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">İlanlar</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {membership.name} · {ui.hiring.createJobLead}
        </p>
      </div>
      <PodTestPlusSoon />

      {!publishCap.allowed ? (
        <div className="rounded-md border border-[var(--line)] px-4 py-3 text-sm">
          <p className="font-medium">Pilot erişimi yok</p>
          <p className="mt-1 text-[var(--muted)]">{ui.hiring.noPilotAccess}</p>
          <Link href="/isveren" className="mt-2 inline-block text-[var(--accent)] underline">
            İşveren ana sayfasına dön
          </Link>
        </div>
      ) : null}

      {publishCap.allowed && slotsExhausted ? (
        <div className="rounded-md border border-[var(--line)] px-4 py-3 text-sm">
          <p className="font-medium">İlan kotası dolu</p>
          <p className="mt-1 text-[var(--muted)]">{ui.hiring.slotsExhausted}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {ui.hiring.pilotLimitJobs} (aktif yayımlı: {activePublished}/
            {HIRING_ACTIVE_JOBS_PER_WORKSPACE})
          </p>
        </div>
      ) : null}

      <EmployerJobsPanel
        workspaceId={wsId}
        jobs={jobs.map((j) => ({ id: j.id, title: j.title, status: j.status, slug: j.slug }))}
        eligibleContacts={eligibleContacts}
        canCreate={canCreate}
        createBlockedReason={
          !publishCap.allowed ? "capability" : slotsExhausted ? "slots" : null
        }
      />
    </section>
  );
}
