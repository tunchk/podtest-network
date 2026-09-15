import Link from "next/link";
import { listDirectoryProfiles } from "@/lib/profiles/service";
import { ui } from "@/lib/ui-copy";

type SearchParams = Promise<{
  sayfa?: string;
  beceri?: string;
  isArıyor?: string;
  iseAliyor?: string;
  proje?: string;
}>;

export default async function MembersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = Number(params.sayfa ?? "1") || 1;
  const skill = params.beceri?.trim() || undefined;
  const result = await listDirectoryProfiles({
    page,
    pageSize: 12,
    skill,
    openToWork: params.isArıyor === "1",
    hiring: params.iseAliyor === "1",
    openToProjects: params.proje === "1",
  });

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.directory.title}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Yalnızca yayımlanmış, onaylanmış ve keşfedilebilir profiller listelenir.
        </p>
      </div>

      <form className="panel grid gap-3 md:grid-cols-4" method="get">
        <div className="field md:col-span-2">
          <label htmlFor="beceri">{ui.directory.skill}</label>
          <input id="beceri" name="beceri" defaultValue={skill ?? ""} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isArıyor" value="1" defaultChecked={params.isArıyor === "1"} />
          {ui.directory.openToWork}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="iseAliyor" value="1" defaultChecked={params.iseAliyor === "1"} />
          {ui.directory.hiring}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="proje" value="1" defaultChecked={params.proje === "1"} />
          {ui.directory.openToProjects}
        </label>
        <button type="submit" className="btn btn-secondary md:col-span-4 md:w-fit">
          {ui.directory.apply}
        </button>
      </form>

      {result.items.length === 0 ? (
        <div className="panel text-[var(--muted)]">{ui.directory.empty}</div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {result.items.map((member) => (
            <li key={member.slug} className="panel">
              <Link href={`/u/${member.slug}`} className="block">
                <h2 className="font-[family-name:var(--font-display)] text-xl">{member.displayName}</h2>
                {member.headline ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">{member.headline}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {member.openToWork ? <span className="badge">İş arıyor</span> : null}
                  {member.hiring ? <span className="badge">İşe alıyor</span> : null}
                  {member.openToProjects ? <span className="badge">Projeye açık</span> : null}
                </div>
                {member.skills.length ? (
                  <p className="mt-3 text-xs text-[var(--muted)]">{member.skills.slice(0, 6).join(" · ")}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex gap-3 text-sm">
          {page > 1 ? (
            <Link href={`/uyeler?sayfa=${page - 1}`} className="text-[var(--accent-strong)]">
              Önceki
            </Link>
          ) : null}
          <span className="text-[var(--muted)]">
            Sayfa {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/uyeler?sayfa=${page + 1}`} className="text-[var(--accent-strong)]">
              Sonraki
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
