import { notFound } from "next/navigation";
import { getPublicProfileBySlug } from "@/lib/profiles/service";
import { getOwnerDraftPreviewBySlug } from "@/lib/profiles/preview";
import { getSession } from "@/lib/session";
import type { PublicProfileView } from "@/lib/profiles/types";
import { sanitizeExternalUrl } from "@/lib/security/urls";
import { MessageRequestButton } from "@/components/messaging/message-request-button";
import { listPublishedFaqsForExpert } from "@/lib/community/expert-faq";
import { listPublicAppearancesForMember } from "@/lib/community/episodes";
import { PlainTextWithLinks } from "@/components/community/plain-text-with-links";
import { prisma } from "@/lib/db";
import { ReportButton } from "@/components/community/report-button";

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
    const userId = publicResult.profile.userId;
    const showMessageCta = session?.user?.id && session.user.id !== userId;

    const [faqs, appearances, expertBits] = await Promise.all([
      listPublishedFaqsForExpert(userId),
      listPublicAppearancesForMember(userId),
      prisma.profile.findUnique({
        where: { userId },
        select: {
          expertDiscussionAreas: true,
          consultationUrl: true,
          consultationPaid: true,
          speakerParticipation: true,
        },
      }),
    ]);

    return (
      <div className="space-y-4">
        <ProfileView view={publicResult.view} />
        {expertBits &&
      (expertBits.speakerParticipation ||
        expertBits.expertDiscussionAreas.length > 0 ||
        expertBits.consultationUrl) ? (
          <section className="panel space-y-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl">Uzman katılımı</h2>
            {expertBits.speakerParticipation ? (
              <p className="text-sm text-[var(--muted)]">
                Konuşmacı katılımı (mesleki yeterlilik doğrulaması değildir).
              </p>
            ) : null}
            {expertBits.expertDiscussionAreas.length ? (
              <p className="text-sm">Alanlar: {expertBits.expertDiscussionAreas.join(", ")}</p>
            ) : null}
            {expertBits.consultationUrl ? (
              <p className="text-sm">
                Danışmanlık:{" "}
                <a
                  href={expertBits.consultationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  harici bağlantı
                </a>
                {expertBits.consultationPaid ? " · ücretli hizmet" : null}
              </p>
            ) : null}
          </section>
        ) : null}
        {faqs.length ? (
          <section className="panel space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl">SSS</h2>
            <ul className="space-y-3">
              {faqs.map((f) => (
                <li key={f.id}>
                  <p className="font-medium">{f.question}</p>
                  <PlainTextWithLinks
                    text={f.answer}
                    className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]"
                  />
                  {session?.user ? (
                    <div className="mt-1">
                      <ReportButton targetType="EXPERT_FAQ" targetId={f.id} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {appearances.length ? (
          <section className="panel space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl">Podcast görünümleri</h2>
            <ul className="space-y-2 text-sm">
              {appearances.map((a) => (
                <li key={a.id}>
                  {a.episode.series} — {a.episode.title}
                  {a.episode.listeningUrl ? (
                    <>
                      {" · "}
                      <a
                        href={a.episode.listeningUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Dinle
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {showMessageCta ? (
          <MessageRequestButton
            recipientUserId={userId}
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
