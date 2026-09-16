import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createDefaultProfileForUser } from "@/lib/profiles/service";
import {
  saveProfileAction,
  submitPublicationAction,
  unpublishAction,
} from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { CvAssistPanel } from "@/components/cv-assist-panel";
import { ui } from "@/lib/ui-copy";

type SearchParams = Promise<{ sekme?: string }>;

function tabHref(sekme: string) {
  return `/hesabim/profil?sekme=${sekme}`;
}

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const sp = await searchParams;
  const tab = sp.sekme === "cv" || sp.sekme === "gorunurluk" ? sp.sekme : "bilgi";

  let profile = await prisma.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) {
    profile = await createDefaultProfileForUser({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    });
  }

  const pendingReview = await prisma.publicationReview.findFirst({
    where: { profileId: profile.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  const statusLabel =
    ui.profile.statuses[profile.publicationStatus as keyof typeof ui.profile.statuses] ??
    profile.publicationStatus;

  const hasPublic = Boolean(profile.published && profile.publicSnapshot);
  const isPending = profile.publicationStatus === "PENDING_REVIEW" || Boolean(pendingReview);
  const canSubmit = !isPending;
  const canUnpublish = hasPublic && profile.publicationStatus === "APPROVED";

  const experienceText =
    typeof profile.experience === "string"
      ? profile.experience
      : profile.experience
        ? JSON.stringify(profile.experience)
        : "";
  const educationText =
    typeof profile.education === "string"
      ? profile.education
      : profile.education
        ? JSON.stringify(profile.education)
        : "";
  const projectsText =
    typeof profile.projects === "string"
      ? profile.projects
      : profile.projects
        ? JSON.stringify(profile.projects)
        : "";
  const linksText = Array.isArray(profile.publicLinks)
    ? (profile.publicLinks as { url?: string }[])
        .map((item) => item.url)
        .filter(Boolean)
        .join("\n")
    : "";

  const currentSummary = {
    displayName: profile.displayName,
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    skills: profile.skills.join(", "),
    interests: profile.interests.join(", "),
    experience: experienceText,
    education: educationText,
    projects: projectsText,
    languages: Array.isArray(profile.languages) ? (profile.languages as string[]).join(", ") : "",
    location: profile.location ?? "",
    workPreferences: profile.workPreferences ?? "",
    publicLinks: linksText,
  };

  const tabs = [
    { id: "bilgi", label: ui.profile.tabInfo },
    { id: "cv", label: ui.profile.tabCv },
    { id: "gorunurluk", label: ui.profile.tabVisibility },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.profile.title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{ui.profile.draftHint}</p>
        </div>
        <span className="badge">{statusLabel}</span>
      </div>

      <div className="flex flex-wrap gap-2 no-print">
        <Link href={`/u/${profile.slug}?onizleme=1`} className="btn btn-secondary">
          {ui.profile.previewDraft}
        </Link>
        {hasPublic ? (
          <Link href={`/u/${profile.slug}`} className="btn btn-ghost">
            {ui.profile.previewPublic}
          </Link>
        ) : null}
        {canSubmit ? (
          <ActionForm action={submitPublicationAction}>
            <button type="submit" className="btn btn-primary">
              {ui.profile.submitReview}
            </button>
          </ActionForm>
        ) : (
          <button type="button" className="btn btn-primary opacity-60" disabled>
            {ui.profile.submitDisabledPending}
          </button>
        )}
        {canUnpublish ? (
          <ActionForm action={unpublishAction}>
            <button type="submit" className="btn btn-ghost">
              {ui.profile.unpublish}
            </button>
          </ActionForm>
        ) : null}
      </div>

      {hasPublic && isPending ? (
        <p className="rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-strong)]">
          {ui.profile.pendingWhilePublished}
        </p>
      ) : null}
      {!hasPublic && !isPending ? (
        <p className="text-sm text-[var(--muted)]">{ui.profile.privateDraftHelp}</p>
      ) : null}
      {profile.rejectionReason ? (
        <p className="text-sm text-[var(--danger)]">Red nedeni: {profile.rejectionReason}</p>
      ) : null}

      <nav aria-label="Profil bölümleri" className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-2 text-sm">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <Link
              key={t.id}
              href={tabHref(t.id)}
              className={
                active
                  ? "rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white"
                  : "rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--muted)] hover:text-[var(--ink)]"
              }
              aria-current={active ? "page" : undefined}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {tab === "bilgi" ? (
        <ActionForm action={saveProfileAction} className="panel">
          <div className="field">
            <label htmlFor="displayName">Görünen ad</label>
            <input id="displayName" name="displayName" defaultValue={profile.displayName} required />
          </div>
          <div className="field">
            <label htmlFor="slug">Paylaşılabilir kısa ad</label>
            <input id="slug" name="slug" defaultValue={profile.slug} required />
          </div>
          <div className="field">
            <label htmlFor="headline">Başlık</label>
            <input id="headline" name="headline" defaultValue={profile.headline ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="bio">Biyografi</label>
            <textarea id="bio" name="bio" defaultValue={profile.bio ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="skills">Beceriler (virgülle)</label>
            <input id="skills" name="skills" defaultValue={profile.skills.join(", ")} />
          </div>
          <div className="field">
            <label htmlFor="interests">İlgi alanları (virgülle)</label>
            <input id="interests" name="interests" defaultValue={profile.interests.join(", ")} />
          </div>
          <div className="field">
            <label htmlFor="experience">Deneyim</label>
            <textarea id="experience" name="experience" defaultValue={experienceText} />
          </div>
          <div className="field">
            <label htmlFor="education">Eğitim</label>
            <textarea id="education" name="education" defaultValue={educationText} />
          </div>
          <div className="field">
            <label htmlFor="projects">Projeler</label>
            <textarea id="projects" name="projects" defaultValue={projectsText} />
          </div>
          <div className="field">
            <label htmlFor="languages">Diller (virgülle)</label>
            <input
              id="languages"
              name="languages"
              defaultValue={
                Array.isArray(profile.languages) ? (profile.languages as string[]).join(", ") : ""
              }
            />
          </div>
          <div className="field">
            <label htmlFor="location">Konum</label>
            <input id="location" name="location" defaultValue={profile.location ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="workPreferences">Çalışma tercihleri</label>
            <textarea
              id="workPreferences"
              name="workPreferences"
              defaultValue={profile.workPreferences ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="publicLinks">Herkese açık bağlantılar (satır satır URL)</label>
            <textarea id="publicLinks" name="publicLinks" defaultValue={linksText} />
          </div>

          <fieldset className="mb-4 space-y-2 text-sm">
            <legend className="mb-2 text-[var(--muted)]">Durum işaretleri (yetki vermez)</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="openToWork" defaultChecked={profile.openToWork} />
              İş arıyorum
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="hiring" defaultChecked={profile.hiring} />
              İşe alıyorum
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="openToProjects" defaultChecked={profile.openToProjects} />
              Projeye açığım
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="discoverable" defaultChecked={profile.discoverable} />
              Onaylandıktan sonra dizinde görün
            </label>
          </fieldset>

          <button type="submit" className="btn btn-primary">
            {ui.profile.save}
          </button>
        </ActionForm>
      ) : null}

      {tab === "cv" ? (
        <CvAssistPanel draftRevision={profile.draftRevision} currentSummary={currentSummary} />
      ) : null}

      {tab === "gorunurluk" ? (
        <section className="panel space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl">{ui.profile.visibilityTitle}</h2>
          <p className="text-sm text-[var(--muted)]">{ui.profile.visibilityBody}</p>
          <p className="text-sm text-[var(--muted)]">
            Taslak alanlar inceleme/onay olmadan kamuya açılmaz. CV yükleme veya AI önerisi tek
            başına profili yayımlamaz. Ham CV profil görünürlüğünden bağımsızdır.{" "}
            <Link href="/yasal/profile_visibility_notice" className="underline">
              Görünürlük bilgilendirmesi
            </Link>
            {" · "}
            <Link href="/hesabim/yasal" className="underline">
              Yasal tercihler
            </Link>
          </p>
          <p className="text-sm text-[var(--muted)]">{ui.profile.reviewNote}</p>
          <p className="text-sm">
            Durum: <strong>{statusLabel}</strong>
            {hasPublic ? " · Herkese açık bir sürüm mevcut." : " · Herkese açık sürüm yok."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/u/${profile.slug}?onizleme=1`} className="btn btn-secondary">
              {ui.profile.previewDraft}
            </Link>
            {hasPublic ? (
              <Link href={`/u/${profile.slug}`} className="btn btn-ghost">
                {ui.profile.previewPublic}
              </Link>
            ) : null}
            {canSubmit ? (
              <ActionForm action={submitPublicationAction}>
                <button type="submit" className="btn btn-primary">
                  {ui.profile.submitReview}
                </button>
              </ActionForm>
            ) : null}
            {canUnpublish ? (
              <ActionForm action={unpublishAction}>
                <button type="submit" className="btn btn-ghost">
                  {ui.profile.unpublish}
                </button>
              </ActionForm>
            ) : null}
          </div>
          <p className="text-sm text-[var(--muted)]">
            <Link href="/mesajlar" className="underline">
              Mesaj tercihleri
            </Link>
            {" · "}
            <Link href="/hesabim/uzman" className="underline">
              Uzman katılımı
            </Link>
            {" · "}
            <Link href="/hesabim/gorunumler" className="underline">
              Podcast görünümleri
            </Link>
            {" · "}
            <Link href="/hesabim/eposta-dogrula" className="underline">
              E-posta doğrulama
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
