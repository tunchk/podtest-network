import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listOwnerFaqs } from "@/lib/community/expert-faq";
import { listTargetedForExpert } from "@/lib/community/targeted";
import { ExpertSettingsForm } from "@/components/community/expert-settings-form";
import { ExpertFaqPanel } from "@/components/community/expert-faq-panel";

export default async function ExpertAccountPage() {
  const session = await requireSession();
  const profile = await prisma.profile.findUnique({ where: { userId: session.user.id } });
  const [faqs, targeted] = await Promise.all([
    listOwnerFaqs(session.user.id),
    listTargetedForExpert(session.user.id),
  ]);

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">Uzman katılımı</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          İsteğe bağlıdır. Konuşmacı katılımı personel/sunucu yetkisi değildir. Cansu İste yalnızca
          ürün örneğidir; onun adına profil veya FAQ yayımlanmaz.
        </p>
        {profile?.speakerParticipation ? (
          <p className="mt-2 text-sm text-[var(--accent-strong)]">Konuşmacı katılımı: aktif</p>
        ) : null}
      </div>

      {profile ? (
        <ExpertSettingsForm
          initial={{
            expertDiscussionAreas: profile.expertDiscussionAreas.join(", "),
            acceptTargetedQuestions: profile.acceptTargetedQuestions,
            consultationUrl: profile.consultationUrl ?? "",
            consultationPaid: profile.consultationPaid,
            showAppearancesOnProfile: profile.showAppearancesOnProfile,
          }}
        />
      ) : null}

      <ExpertFaqPanel
        faqs={faqs.map((f) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
          status: f.status,
          currentRevision: f.currentRevision,
          expertApprovedRevision: f.expertApprovedRevision,
        }))}
      />

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Hedefli sorular</h2>
        <p className="text-sm text-[var(--muted)]">
          Hedefli sorular yanıt davetidir; hizmet sözü değildir. Reddedebilir veya kapatabilirsin.
        </p>
        {targeted.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Açık hedefli soru yok.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {targeted.map((t) => (
              <li key={t.id} className="border-b border-[var(--line)] pb-2">
                <p className="whitespace-pre-wrap">{t.body}</p>
                <p className="text-[var(--muted)]">Durum: {t.status}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
