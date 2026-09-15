import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { isAuthorizedHost } from "@/lib/arayanlar/host-auth";
import { listApplicationsForHost } from "@/lib/arayanlar/service";
import { isStaffRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AdminAssignPanel } from "@/components/arayanlar/admin-assign";

export default async function SunucuBasvurularPage() {
  const session = await requireSession();
  const host = await isAuthorizedHost(session.user.id);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { staffRole: true },
  });
  const admin = user && isStaffRole(user.staffRole, ["ADMIN"]);

  if (!host && !admin) {
    redirect("/");
  }

  const applications = host ? await listApplicationsForHost(session.user.id) : [];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">Sunucu — başvurular</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Yalnızca sana atanmış başvuruları görebilirsin. Abonelik veya HIRING durumu sunucu yetkisi vermez.
        </p>
      </div>

      {admin ? <AdminAssignPanel /> : null}

      {!host ? (
        <p className="text-sm text-[var(--muted)]">Sunucu yetkin yok; yalnızca yönetici atama paneli açık.</p>
      ) : applications.length === 0 ? (
        <p className="panel text-sm text-[var(--muted)]">Sana atanmış başvuru yok.</p>
      ) : (
        <ul className="space-y-3">
          {applications.map((app) => (
            <li key={app.id} className="panel flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{app.user.name}</p>
                <p className="text-[var(--muted)]">
                  {app.prepStatus} · rev {app.submittedRevision}
                </p>
              </div>
              <Link href={`/sunucu/basvurular/${app.id}`} className="btn btn-primary">
                Paketi aç
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
