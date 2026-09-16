import { requireStaff } from "@/lib/session";
import { listPendingReviews } from "@/lib/profiles/service";
import { moderateReviewAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { ui } from "@/lib/ui-copy";
import { catchylabsIntegration } from "@/lib/integrations/catchylabs";
import { prisma } from "@/lib/db";
import { automatedReviewMatches } from "@/lib/moderation/automated-review";
import { listSpeakerInvitations } from "@/lib/community/invitations";
import { listAdminEpisodes, listPendingAppearancesForAdmin } from "@/lib/community/episodes";
import { AdminCommunityPanel } from "@/components/community/admin-community-panel";
import Link from "next/link";

export default async function AdminPage() {
  const { user: staff } = await requireStaff(["ADMIN", "MODERATOR"]);
  const reviews = await listPendingReviews();
  const catchy = await catchylabsIntegration.getAccessStatus("admin-probe");

  const automated = await prisma.automatedContentReview.findMany({
    where: { publicationReviewId: { in: reviews.map((r) => r.id) } },
  });
  const automatedByReview = new Map(automated.map((row) => [row.publicationReviewId, row]));

  const isAdmin = staff.staffRole === "ADMIN";
  let invitations: Awaited<ReturnType<typeof listSpeakerInvitations>> = [];
  let episodes: Awaited<ReturnType<typeof listAdminEpisodes>> = [];
  let pendingAppearances: Awaited<ReturnType<typeof listPendingAppearancesForAdmin>> = [];
  if (isAdmin) {
    invitations = await listSpeakerInvitations(staff.id);
    episodes = await listAdminEpisodes(staff.id);
    pendingAppearances = await listPendingAppearancesForAdmin(staff.id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.admin.title}</h1>
        <p className="mt-2 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-strong)]">
          {ui.admin.manualBanner} Yardımcı tarama kural tabanlıdır (OpenAI moderasyon
          entegrasyonu değildir). İnsan onayı zorunludur. Kullanılamayan tarama güvenli sayılmaz. Üye
          CV dosyaları burada gösterilmez.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/yonetim/moderasyon" className="underline">
            Mesaj / içerik rapor kuyruğu
          </Link>
        </p>
      </div>

      <section className="panel">
        <h2 className="font-[family-name:var(--font-display)] text-xl">{ui.admin.reviews}</h2>
        {reviews.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">{ui.admin.empty}</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {reviews.map((review) => {
              const snap = review.submittedSnapshot as {
                displayName?: string;
                slug?: string;
                headline?: string;
                bio?: string;
              };
              const assist = automatedByReview.get(review.id) ?? null;
              const matches = automatedReviewMatches(
                {
                  snapshotHash: review.snapshotHash,
                  submittedDraftRevision: review.submittedDraftRevision,
                },
                assist,
              );
              return (
                <li key={review.id} className="rounded-lg border border-[var(--line)] p-4">
                  <p className="font-medium">{snap.displayName}</p>
                  <p className="text-sm text-[var(--muted)]">
                    @{snap.slug} · {review.profile.user.email} · rev {review.submittedDraftRevision}
                  </p>
                  {snap.headline ? <p className="mt-2 text-sm">{snap.headline}</p> : null}
                  {snap.bio ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{snap.bio}</p>
                  ) : null}
                  <div className="mt-3 rounded-md bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
                    <p className="font-medium text-[var(--ink)]">
                      Kural tabanlı yardımcı tarama
                    </p>
                    {!assist || !matches ? (
                      <p className="mt-1">
                        Sonuç yok / eski revizyonla uyumsuz / kullanılamıyor — otomatik güvenli
                        sayılmaz.
                      </p>
                    ) : (
                      <>
                        <p className="mt-1">
                          Sonuç: {assist.outcome} · politika {assist.policyVersion} · adaptör{" "}
                          {assist.providerMode}
                        </p>
                        <p className="mt-1">{assist.summaryForAdmin}</p>
                        {assist.reasonCodes.length ? (
                          <p className="mt-1">Kodlar: {assist.reasonCodes.join(", ")}</p>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <ActionForm action={moderateReviewAction}>
                      <input type="hidden" name="reviewId" value={review.id} />
                      <input type="hidden" name="decision" value="APPROVED" />
                      <button type="submit" className="btn btn-primary">
                        {ui.admin.approve}
                      </button>
                    </ActionForm>
                    <ActionForm action={moderateReviewAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="reviewId" value={review.id} />
                      <input type="hidden" name="decision" value="REJECTED" />
                      <div className="field mb-0">
                        <label htmlFor={`reason-${review.id}`}>{ui.admin.reason}</label>
                        <input id={`reason-${review.id}`} name="reason" required />
                      </div>
                      <button type="submit" className="btn btn-ghost">
                        {ui.admin.reject}
                      </button>
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel text-sm text-[var(--muted)]">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
          Catchylabs sınırı
        </h2>
        <p className="mt-2">Durum: {catchy.status}</p>
        <p className="mt-1">{catchy.message}</p>
      </section>

      {isAdmin ? (
        <section className="panel">
          <AdminCommunityPanel
            invitations={invitations.map((i) => ({
              ...i,
              expiresAt: i.expiresAt.toISOString(),
            }))}
            episodes={episodes}
            pendingAppearances={pendingAppearances}
          />
        </section>
      ) : null}
    </div>
  );
}
