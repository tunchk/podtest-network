import { requireSession } from "@/lib/session";
import {
  listMemberAppearanceRequests,
  listPublishedEpisodeOptions,
} from "@/lib/community/episodes";
import {
  AcceptAppearanceButton,
  AppearanceRequestForm,
} from "@/components/community/appearance-request-form";

export default async function AppearancesPage() {
  const session = await requireSession();
  const [episodes, requests] = await Promise.all([
    listPublishedEpisodeOptions(),
    listMemberAppearanceRequests(session.user.id),
  ]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">Podcast görünümleri</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Yalnızca yayımlanmış bölümler için talep edebilirsin. Kendin doğrulayamazsın; yönetici
          onayı gerekir. Yönetici önerisi için üye kabulü şarttır.
        </p>
      </div>
      <AppearanceRequestForm episodes={episodes} />
      <ul className="space-y-2 text-sm">
        {requests.map((r) => (
          <li key={r.id} className="border-b border-[var(--line)] pb-2">
            <p>
              {r.episode.series} — {r.episode.title}{" "}
              <span className="text-[var(--muted)]">
                ({r.episode.publicationState}) · {r.status}
              </span>
            </p>
            {r.status === "PENDING_MEMBER" ? (
              <AcceptAppearanceButton appearanceId={r.id} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
