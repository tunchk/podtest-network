import { notFound } from "next/navigation";
import { getPublicProfileBySlug } from "@/lib/profiles/service";
import { getOwnerDraftPreviewBySlug } from "@/lib/profiles/preview";
import { getSession } from "@/lib/session";
import type { PublicProfileView } from "@/lib/profiles/types";
import { sanitizeExternalUrl } from "@/lib/security/urls";
import { MessageRequestButton } from "@/components/messaging/message-request-button";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ onizleme?: string }>;

function ProfileView({ view, preview }: { view: PublicProfileView; preview?: boolean }) {
  return (
    <article className="panel space-y-4">
      {preview ? (
        <p className="no-print rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-strong)]">
          Özel önizleme — bu görünüm henüz herkese açık olmayabilir.
        </p>
      ) : null}
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-4xl">{view.displayName}</h1>
        {view.headline ? <p className="mt-2 text-lg text-[var(--muted)]">{view.headline}</p> : null}
        {view.location ? <p className="mt-1 text-sm text-[var(--muted)]">{view.location}</p> : null}
      </header>
      <div className="flex flex-wrap gap-2">
        {view.openToWork ? <span className="badge">İş arıyor</span> : null}
        {view.hiring ? <span className="badge">İşe alıyor</span> : null}
        {view.openToProjects ? <span className="badge">Projeye açık</span> : null}
      </div>
      {view.bio ? <p className="whitespace-pre-wrap text-[var(--ink)]">{view.bio}</p> : null}
      {view.skills.length ? (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Beceriler</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{view.skills.join(", ")}</p>
        </section>
      ) : null}
      {view.interests.length ? (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">İlgi alanları</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{view.interests.join(", ")}</p>
        </section>
      ) : null}
      {view.experience ? (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Deneyim</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">
            {typeof view.experience === "string" ? view.experience : JSON.stringify(view.experience, null, 2)}
          </p>
        </section>
      ) : null}
      {view.education ? (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Eğitim</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">
            {typeof view.education === "string" ? view.education : JSON.stringify(view.education, null, 2)}
          </p>
        </section>
      ) : null}
      {view.projects ? (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Projeler</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">
            {typeof view.projects === "string" ? view.projects : JSON.stringify(view.projects, null, 2)}
          </p>
        </section>
      ) : null}
      {view.workPreferences ? (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Çalışma tercihleri</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">{view.workPreferences}</p>
        </section>
      ) : null}
      {Array.isArray(view.publicLinks) && view.publicLinks.length ? (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Bağlantılar</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {(view.publicLinks as { url?: string }[]).map((link) => {
              const safe = link.url ? sanitizeExternalUrl(link.url) : null;
              return safe ? (
                <li key={safe}>
                  <a href={safe} className="text-[var(--accent-strong)]" rel="noreferrer noopener">
                    {safe}
                  </a>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const publicResult = await getPublicProfileBySlug(slug);
  const session = await getSession();

  if (publicResult) {
    const showMessageCta =
      session?.user?.id &&
      session.user.id !== publicResult.profile.userId;

    return (
      <div className="space-y-4">
        <ProfileView view={publicResult.view} />
        {showMessageCta ? (
          <MessageRequestButton
            recipientUserId={publicResult.profile.userId}
            recipientName={publicResult.view.displayName}
          />
        ) : null}
      </div>
    );
  }

  if (query.onizleme === "1") {
    const preview = await getOwnerDraftPreviewBySlug(slug, session?.user?.id ?? null);
    if (preview) {
      return <ProfileView view={preview.view} preview />;
    }
  }

  notFound();
}
