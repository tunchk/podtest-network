import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { registerAction } from "@/app/actions";
import { ui } from "@/lib/ui-copy";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const session = await getSession();
  if (session?.user) redirect("/hesabim/profil");

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.auth.registerTitle}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Üyelik için başvuru yok. E-posta doğrulama bu ortamda gönderilmez.
      </p>
      <ActionForm action={registerAction} className="panel mt-6">
        <div className="field">
          <label htmlFor="name">{ui.auth.name}</label>
          <input id="name" name="name" required autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="email">{ui.auth.email}</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">{ui.auth.password}</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <button type="submit" className="btn btn-primary w-full">
          {ui.auth.submitRegister}
        </button>
      </ActionForm>
      <p className="mt-4 text-sm text-[var(--muted)]">
        {ui.auth.haveAccount}{" "}
        <Link href="/giris" className="text-[var(--accent-strong)]">
          {ui.nav.signIn}
        </Link>
      </p>
    </div>
  );
}
