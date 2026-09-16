import Link from "next/link";
import { listPublicJobs } from "@/lib/hiring/jobs";
import { PodTestPlusSoon } from "@/components/hiring/podtest-plus-soon";
import { ui } from "@/lib/ui-copy";

type SearchParams = Promise<{ sayfa?: string }>;

export default async function IsIlanlariPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = Number(sp.sayfa ?? "1");
  const list = await listPublicJobs(page);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.hiring.jobsPublic}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{ui.hiring.jobsPublicLead}</p>
      </div>
      <PodTestPlusSoon />
      {list.items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Henüz yayımlanmış ilan yok.</p>
      ) : (
        <ul className="space-y-3">
          {list.items.map((job) => (
            <li key={job.id} className="border-b border-[var(--line)] pb-3">
              <Link href={`/is-ilanlari/${job.slug}`} className="font-medium hover:underline">
                {job.title}
              </Link>
              <p className="text-sm text-[var(--muted)]">
                {job.workspace.name}
                {job.location ? ` · ${job.location}` : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
