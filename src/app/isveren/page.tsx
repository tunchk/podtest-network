import Link from "next/link";
import { requireSession } from "@/lib/session";
import { listActiveWorkspacesForUser } from "@/lib/hiring/access";
import { evaluateUserCapability } from "@/lib/capabilities/evaluate";
import { CreateWorkspaceForm, WorkspaceMembersPanel } from "@/components/hiring/employer-hub";
import { PodTestPlusSoon } from "@/components/hiring/podtest-plus-soon";
import { ui } from "@/lib/ui-copy";

export default async function IsverenPage() {
  const session = await requireSession();
  const workspaces = await listActiveWorkspacesForUser(session.user.id);
  const publishCap = await evaluateUserCapability(session.user.id, "hiring.job.publish");
  const primaryWs = workspaces[0];

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.hiring.title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{ui.hiring.lead}</p>
      </div>
      <PodTestPlusSoon />

      {primaryWs && publishCap.allowed ? (
        <div className="panel flex flex-wrap items-center justify-between gap-4 border-[var(--accent)]/30 bg-[var(--accent-soft)]/40">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl">{ui.hiring.createJob}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{ui.hiring.createJobLead}</p>
          </div>
          <Link
            href={`/isveren/ilanlar?ws=${primaryWs.id}`}
            className="btn btn-primary shrink-0"
          >
            {ui.hiring.createJob}
          </Link>
        </div>
      ) : null}

      {!publishCap.allowed ? (
        <div className="rounded-md border border-[var(--line)] px-4 py-3 text-sm">
          <p className="font-medium text-[var(--ink)]">Pilot erişimi yok</p>
          <p className="mt-1 text-[var(--muted)]">{ui.hiring.noPilotAccess}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Geliştirme ortamında seed ile pilot yetkisi verilebilir. Yetki olmadan ilan düğmeleri
            açılmaz.
          </p>
        </div>
      ) : null}

      {workspaces.length ? (
        <div className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Çalışma alanların</h2>
          <ul className="space-y-2">
            {workspaces.map((w) => (
              <li key={w.id} className="rounded-md border border-[var(--line)] p-4">
                <p className="font-medium">{w.name}</p>
                <p className="text-sm text-[var(--muted)]">
                  Rol: {w.role === "OWNER" ? "Sahip" : "İşe alım uzmanı"}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Link
                    href={`/isveren/ilanlar?ws=${w.id}`}
                    className="btn btn-primary text-sm"
                  >
                    {ui.hiring.createJob}
                  </Link>
                  <Link href={`/isveren/ilanlar?ws=${w.id}`} className="btn btn-ghost text-sm">
                    İlanlar
                  </Link>
                  <Link href={`/isveren/adaylar?ws=${w.id}`} className="btn btn-ghost text-sm">
                    Adaylar
                  </Link>
                  <Link href={`/isveren/aramalar?ws=${w.id}`} className="btn btn-ghost text-sm">
                    Kayıtlı aramalar
                  </Link>
                </div>
                <WorkspaceMembersPanel workspaceId={w.id} role={w.role} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="panel space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl">İlk çalışma alanın</h2>
          <p className="text-sm text-[var(--muted)]">{ui.hiring.noWorkspace}</p>
          <p className="text-sm text-[var(--muted)]">
            Genel profil, CV veya ilgi alanı zorunlu değildir. Şirket adı girildi diye doğrulanmış
            işveren sayılmazsınız.
          </p>
          {!publishCap.allowed ? (
            <p className="text-sm text-red-700">
              Çalışma alanı oluşturmak için de pilot yetkisi gerekir. Önce yetkiyi alın; düğme
              yetkisiz etkinleştirilmez.
            </p>
          ) : null}
          <CreateWorkspaceForm canCreate={publishCap.allowed} />
        </div>
      )}
    </section>
  );
}
