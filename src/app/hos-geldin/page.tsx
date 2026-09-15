import Link from "next/link";
import { requireSession } from "@/lib/session";
import { skipOnboardingAction, completeOnboardingAction } from "@/app/actions";
import { ui } from "@/lib/ui-copy";
import { ActionForm } from "@/components/action-form";

export default async function WelcomePage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.onboarding.title}</h1>
      <p className="mt-3 text-[var(--muted)]">{ui.onboarding.lead}</p>
      <div className="panel mt-6 space-y-4">
        <ActionForm action={skipOnboardingAction}>
          <button type="submit" className="btn btn-secondary w-full">
            {ui.onboarding.skip}
          </button>
        </ActionForm>
        <ActionForm action={completeOnboardingAction}>
          <button type="submit" className="btn btn-primary w-full">
            {ui.onboarding.continueProfile}
          </button>
        </ActionForm>
        <p className="text-sm text-[var(--muted)]">
          İstersen doğrudan{" "}
          <Link href="/hesabim/profil" className="text-[var(--accent-strong)]">
            profiline
          </Link>{" "}
          de gidebilirsin.
        </p>
      </div>
    </div>
  );
}
