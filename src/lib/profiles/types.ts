export type ProfileDraftFields = {
  displayName: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  skills: string[];
  interests: string[];
  experience: unknown;
  education: unknown;
  projects: unknown;
  languages: unknown;
  location: string | null;
  workPreferences: string | null;
  publicLinks: unknown;
  openToWork: boolean;
  hiring: boolean;
  openToProjects: boolean;
  discoverable: boolean;
};

/** Fields safe for public profile pages and directory cards. */
export const PUBLIC_PROFILE_ALLOWLIST = [
  "displayName",
  "slug",
  "headline",
  "bio",
  "skills",
  "interests",
  "experience",
  "education",
  "projects",
  "languages",
  "location",
  "workPreferences",
  "publicLinks",
  "openToWork",
  "hiring",
  "openToProjects",
] as const;

export type PublicProfileView = {
  displayName: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  skills: string[];
  interests: string[];
  experience: unknown;
  education: unknown;
  projects: unknown;
  languages: unknown;
  location: string | null;
  workPreferences: string | null;
  publicLinks: unknown;
  openToWork: boolean;
  hiring: boolean;
  openToProjects: boolean;
};

export function toPublicProfileView(snapshot: ProfileDraftFields): PublicProfileView {
  return {
    displayName: snapshot.displayName,
    slug: snapshot.slug,
    headline: snapshot.headline,
    bio: snapshot.bio,
    skills: snapshot.skills,
    interests: snapshot.interests,
    experience: snapshot.experience,
    education: snapshot.education,
    projects: snapshot.projects,
    languages: snapshot.languages,
    location: snapshot.location,
    workPreferences: snapshot.workPreferences,
    publicLinks: snapshot.publicLinks,
    openToWork: snapshot.openToWork,
    hiring: snapshot.hiring,
    openToProjects: snapshot.openToProjects,
  };
}

export function draftFromProfile(profile: {
  displayName: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  skills: string[];
  interests: string[];
  experience: unknown;
  education: unknown;
  projects: unknown;
  languages: unknown;
  location: string | null;
  workPreferences: string | null;
  publicLinks: unknown;
  openToWork: boolean;
  hiring: boolean;
  openToProjects: boolean;
  discoverable: boolean;
}): ProfileDraftFields {
  return {
    displayName: profile.displayName,
    slug: profile.slug,
    headline: profile.headline,
    bio: profile.bio,
    skills: profile.skills,
    interests: profile.interests,
    experience: profile.experience,
    education: profile.education,
    projects: profile.projects,
    languages: profile.languages,
    location: profile.location,
    workPreferences: profile.workPreferences,
    publicLinks: profile.publicLinks,
    openToWork: profile.openToWork,
    hiring: profile.hiring,
    openToProjects: profile.openToProjects,
    discoverable: profile.discoverable,
  };
}

export function slugify(input: string): string {
  return input
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function parseStringList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 40);
}
