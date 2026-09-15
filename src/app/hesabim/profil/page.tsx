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

export default async function ProfilePage() {
  const session = await requireSession();
  let profile = await prisma.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) {
    profile = await createDefaultProfileForUser({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    });
  }

  const statusLabel =
    ui.profile.statuses[profile.publicationStatus as keyof typeof ui.profile.statuses] ??
    profile.publicationStatus;

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.profile.title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{ui.profile.draftHint}</p>
        </div>
        <span className="badge">{statusLabel}</span>
      </div>

      <div className="panel">
        <h2 className="font-[family-name:var(--font-display)] text-lg">{ui.profile.visibilityTitle}</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{ui.profile.visibilityBody}</p>
        <p className="mt-3 text-sm text-[var(--warning)]">{ui.profile.manualReviewNote}</p>
        {profile.rejectionReason ? (
          <p className="mt-3 text-sm text-[var(--danger)]">Red nedeni: {profile.rejectionReason}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2 no-print">
          <ActionForm action={submitPublicationAction}>
            <button type="submit" className="btn btn-primary">
              {ui.profile.submitReview}
            </button>
          </ActionForm>
          <ActionForm action={unpublishAction}>
            <button type="submit" className="btn btn-ghost">
              {ui.profile.unpublish}
            </button>
          </ActionForm>
          <Link href={`/u/${profile.slug}?onizleme=1`} className="btn btn-secondary">
            {ui.profile.preview}
          </Link>
        </div>
      </div>

      <CvAssistPanel draftRevision={profile.draftRevision} currentSummary={currentSummary} />

      <ActionForm action={saveProfileAction} className="panel">
        <div className="field">
          <label htmlFor="displayName">Görünen ad</label>
          <input id="displayName" name="displayName" defaultValue={profile.displayName} required />
        </div>
        <div className="field">
          <label htmlFor="slug">Paylaşılabilir kısa ad (slug)</label>
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
          <legend className="mb-2 text-[var(--muted)]">Durumlar (yetki vermez)</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="openToWork" defaultChecked={profile.openToWork} />
            İş arıyorum (OPEN_TO_WORK)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="hiring" defaultChecked={profile.hiring} />
            İşe alıyorum (HIRING)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="openToProjects" defaultChecked={profile.openToProjects} />
            Projeye açığım (OPEN_TO_PROJECTS)
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
    </div>
  );
}
