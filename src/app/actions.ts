"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createDefaultProfileForUser,
  markOnboardingCompleted,
  markOnboardingSkipped,
  submitProfileForReview,
  unpublishProfile,
  updateOwnedProfileDraft,
  resolvePublicationReview,
  ensureUniqueSlug,
} from "@/lib/profiles/service";
import { parseStringList, slugify } from "@/lib/profiles/types";
import { requireSession, requireStaff } from "@/lib/session";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formChecked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

export async function registerAction(formData: FormData) {
  const name = formString(formData, "name");
  const email = formString(formData, "email").toLowerCase();
  const password = formString(formData, "password");
  const acceptTerms = formChecked(formData, "acceptTerms");
  const acceptPrivacy = formChecked(formData, "acceptPrivacy");
  const acceptMarketing = formChecked(formData, "acceptMarketing");

  if (!name || !email || password.length < 8) {
    return { error: "Ad, e-posta ve en az 8 karakterli şifre gerekli." };
  }
  if (!acceptTerms || !acceptPrivacy) {
    return {
      error: "Kayıt için Kullanım Koşulları kabulü ve Aydınlatma Metni onayı zorunludur.",
    };
  }

  try {
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
    });

    const userId = result.user.id;
    const existing = await prisma.profile.findUnique({ where: { userId } });
    if (!existing) {
      await createDefaultProfileForUser({
        id: userId,
        name: result.user.name,
        email: result.user.email,
      });
    }

    const { recordAcceptance } = await import("@/lib/legal/service");
    await recordAcceptance({
      userId,
      type: "TERMS",
      documentType: "TERMS_OF_SERVICE",
      scope: "account_registration",
    });
    await recordAcceptance({
      userId,
      type: "PRIVACY_NOTICE",
      documentType: "PRIVACY_NOTICE",
      scope: "account_registration",
    });
    if (acceptMarketing) {
      await recordAcceptance({
        userId,
        type: "MARKETING",
        documentType: "MARKETING_CONSENT",
        scope: "account_registration",
      });
    }
  } catch (error) {
    if (error instanceof APIError) {
      return { error: error.message || "Kayıt başarısız." };
    }
    throw error;
  }

  redirect("/hos-geldin");
}

export async function loginAction(formData: FormData) {
  const email = formString(formData, "email").toLowerCase();
  const password = formString(formData, "password");

  try {
    await auth.api.signInEmail({
      body: { email, password },
    });
  } catch (error) {
    if (error instanceof APIError) {
      return { error: "E-posta veya şifre hatalı." };
    }
    throw error;
  }

  redirect("/hesabim/profil");
}

export async function logoutAction() {
  await auth.api.signOut({
    headers: await (await import("next/headers")).headers(),
  });
  redirect("/");
}

export async function skipOnboardingAction() {
  const session = await requireSession();
  await markOnboardingSkipped(session.user.id);
  redirect("/hesabim/profil");
}

export async function completeOnboardingAction() {
  const session = await requireSession();
  await markOnboardingCompleted(session.user.id);
  redirect("/hesabim/profil");
}

export async function saveProfileAction(formData: FormData) {
  const session = await requireSession();

  const displayName = formString(formData, "displayName");
  const slugRaw = formString(formData, "slug");
  if (!displayName) {
    return { error: "Görünen ad gerekli." };
  }

  const slug = await ensureUniqueSlug(
    slugify(slugRaw || displayName) || `uye-${session.user.id.slice(0, 8)}`,
  );

  const publicLinksRaw = formString(formData, "publicLinks");
  let publicLinks: unknown = null;
  if (publicLinksRaw) {
    publicLinks = publicLinksRaw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((url) => ({ url }));
  }

  await updateOwnedProfileDraft(session.user.id, {
    displayName,
    slug,
    headline: formString(formData, "headline") || null,
    bio: formString(formData, "bio") || null,
    skills: parseStringList(formData.get("skills")),
    interests: parseStringList(formData.get("interests")),
    experience: formString(formData, "experience") || null,
    education: formString(formData, "education") || null,
    projects: formString(formData, "projects") || null,
    languages: parseStringList(formData.get("languages")),
    location: formString(formData, "location") || null,
    workPreferences: formString(formData, "workPreferences") || null,
    publicLinks,
    openToWork: formChecked(formData, "openToWork"),
    hiring: formChecked(formData, "hiring"),
    openToProjects: formChecked(formData, "openToProjects"),
    discoverable: formChecked(formData, "discoverable"),
  });

  // Hiring / job statuses never grant staff or paid capabilities.
  revalidatePath("/hesabim/profil");
  revalidatePath("/uyeler");
  return { ok: true };
}

export async function submitPublicationAction() {
  const session = await requireSession();
  await submitProfileForReview(session.user.id);
  revalidatePath("/hesabim/profil");
  revalidatePath("/yonetim");
  return { ok: true };
}

export async function unpublishAction() {
  const session = await requireSession();
  await unpublishProfile(session.user.id);
  revalidatePath("/hesabim/profil");
  revalidatePath("/uyeler");
  return { ok: true };
}

export async function moderateReviewAction(formData: FormData) {
  const { user } = await requireStaff(["ADMIN", "MODERATOR"]);
  const reviewId = formString(formData, "reviewId");
  const decision = formString(formData, "decision");
  const reason = formString(formData, "reason");

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return { error: "Geçersiz karar." };
  }

  await resolvePublicationReview({
    reviewId,
    reviewerId: user.id,
    decision,
    reason: reason || undefined,
  });

  revalidatePath("/yonetim");
  revalidatePath("/uyeler");
  revalidatePath("/hesabim/profil");
  return { ok: true };
}
