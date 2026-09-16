import Link from "next/link";
import { requireSession } from "@/lib/session";
import { listActiveWorkspacesForUser } from "@/lib/hiring/access";
import { CreateWorkspaceForm, WorkspaceMembersPanel } from "@/components/hiring/employer-hub";
import { PodTestPlusSoon } from "@/components/hiring/podtest-plus-soon";
import { ui } from "@/lib/ui-copy";

export default async function IsverenPage() {
  const session = await requireSession();
  const workspaces = await listActiveWorkspacesForUser(session.user.id);

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.hiring.title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{ui.hiring.lead}</p>
      </div>
      <PodTestPlusSoon />
      {workspaces.length ? (
        <div className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Çalışma alanların</h2>
          <ul className="space-y-2">
            {workspaces.map((w) => (
              <li key={w.id} className="rounded-md border border-[var(--line)] p-4">
                <p className="font-medium">{w.name}</p>
                <p className="text-sm text-[var(--muted)]">Rol: {w.role === "OWNER" ? "Sahip" : "İşe alım uzmanı"}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  <Link href={`/isveren/ilanlar?ws=${w.id}`} className="underline">
                    İlanlar
                  </Link>
                  <Link href={`/isveren/adaylar?ws=${w.id}`} className="underline">
                    Adaylar
                  </Link>
                  <Link href={`/isveren/aramalar?ws=${w.id}`} className="underline">
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
          <p className="text-sm text-[var(--muted)]">
            Genel profil, CV veya ilgi alanı zorunlu değildir. Şirket adı girildi diye doğrulanmış
            işveren sayılmazsınız.
          </p>
          <CreateWorkspaceForm />
        </div>
      )}
    </section>
  );
}
