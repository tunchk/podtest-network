import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicJobBySlug, isJobPubliclyApplyable } from "@/lib/hiring/jobs";
import { PlainTextWithLinks } from "@/components/community/plain-text-with-links";
import { ReportButton } from "@/components/community/report-button";
import { getSession } from "@/lib/session";
import { ui } from "@/lib/ui-copy";

type Params = Promise<{ slug: string }>;

export default async function JobDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const job = await getPublicJobBySlug(slug);
  if (!job) notFound();
  const session = await getSession();
  const applyable = isJobPubliclyApplyable(job);

  return (
    <article className="space-y-6">
      <Link href="/is-ilanlari" className="text-sm text-[var(--muted)] hover:underline">
        ← İş ilanları
      </Link>
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">{job.title}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {job.workspace.name}
          {job.location ? ` · ${job.location}` : null}
        </p>
      </header>
      <PlainTextWithLinks text={job.description} className="whitespace-pre-wrap" />
      {job.responsibilities ? (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Sorumluluklar</h2>
          <PlainTextWithLinks text={job.responsibilities} className="mt-2 whitespace-pre-wrap text-sm" />
        </section>
      ) : null}
      {job.skills.length ? (
        <p className="text-sm text-[var(--muted)]">Beceriler: {job.skills.join(", ")}</p>
      ) : null}
      <section className="panel space-y-2">
        <h2 className="font-[family-name:var(--font-display)] text-lg">Başvuru</h2>
        {!applyable ? (
          <p className="text-sm text-[var(--muted)]">Bu ilan için başvuru kapalı.</p>
        ) : job.applicationMethod === "EXTERNAL_URL" && job.applicationUrl ? (
          <p className="text-sm">
            {ui.hiring.applyExternal}:{" "}
            <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {job.applicationUrl}
            </a>
          </p>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            {ui.hiring.applyMessage}. Giriş yapıp ilgili kişiye mesaj isteği göndermen gerekir; otomatik
            ATS veya CV yükleme yoktur.
          </p>
        )}
      </section>
      {session?.user ? <ReportButton targetType="JOB_LISTING" targetId={job.id} /> : null}
    </article>
  );
}
