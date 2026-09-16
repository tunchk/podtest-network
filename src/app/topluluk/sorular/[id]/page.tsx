import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicQuestion } from "@/lib/community/questions";
import { PlainTextWithLinks } from "@/components/community/plain-text-with-links";
import { AnswerForm } from "@/components/community/answer-form";
import { ReportButton } from "@/components/community/report-button";
import { getSession } from "@/lib/session";

type Params = Promise<{ id: string }>;

export default async function QuestionDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const question = await getPublicQuestion(id);
  if (!question) notFound();
  const session = await getSession();

  return (
    <article className="space-y-8">
      <div>
        <Link href="/topluluk" className="text-sm text-[var(--muted)] hover:underline">
          ← Topluluk
        </Link>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl">{question.title}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {question.authorDisplayName}
          {question.publishedAt
            ? ` · ${new Date(question.publishedAt).toLocaleString("tr-TR")}`
            : null}
        </p>
        {question.topicTags.length ? (
          <p className="mt-1 text-xs text-[var(--muted)]">{question.topicTags.join(" · ")}</p>
        ) : null}
        {question.episode ? (
          <p className="mt-2 text-sm">
            Bölüm: {question.episode.series} — {question.episode.title}
            {question.episode.listeningUrl ? (
              <>
                {" · "}
                <a
                  href={question.episode.listeningUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Dinle
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <PlainTextWithLinks text={question.body} className="whitespace-pre-wrap text-[var(--ink)]" />

      {session?.user ? (
        <ReportButton targetType="COMMUNITY_QUESTION" targetId={question.id} />
      ) : null}

      <section className="space-y-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl">
          Cevaplar ({question.answers.length})
        </h2>
        {question.answers.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Henüz yayımlanmış cevap yok.</p>
        ) : (
          <ul className="space-y-4">
            {question.answers.map((a) => (
              <li key={a.id} className="border-t border-[var(--line)] pt-4">
                <p className="text-sm text-[var(--muted)]">
                  {a.authorDisplayName}
                  {a.publishedAt
                    ? ` · ${new Date(a.publishedAt).toLocaleString("tr-TR")}`
                    : null}
                </p>
                <PlainTextWithLinks text={a.body} className="mt-2 whitespace-pre-wrap" />
                {session?.user ? (
                  <div className="mt-2">
                    <ReportButton targetType="COMMUNITY_ANSWER" targetId={a.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg">Cevap yaz</h2>
        {session?.user ? (
          <AnswerForm questionId={question.id} />
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Cevap yazmak için <Link href="/giris" className="underline">giriş yap</Link>. CV veya
            genel profil gerekmez.
          </p>
        )}
      </section>
    </article>
  );
}
