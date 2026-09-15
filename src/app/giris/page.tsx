import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { loginAction } from "@/app/actions";
import { ui } from "@/lib/ui-copy";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.user) redirect("/hesabim/profil");

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">{ui.auth.loginTitle}</h1>
      <ActionForm action={loginAction} className="panel mt-6">
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
            autoComplete="current-password"
          />
        </div>
        <button type="submit" className="btn btn-primary w-full">
          {ui.auth.submitLogin}
        </button>
      </ActionForm>
      <p className="mt-4 text-sm text-[var(--muted)]">
        {ui.auth.needAccount}{" "}
        <Link href="/kayit" className="text-[var(--accent-strong)]">
          {ui.nav.signUp}
        </Link>
      </p>
    </div>
  );
}
