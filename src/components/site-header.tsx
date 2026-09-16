import Link from "next/link";
import { ui } from "@/lib/ui-copy";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { logoutAction } from "@/app/actions";
import { isStaffRole } from "@/lib/session";
import { isAuthorizedHost } from "@/lib/arayanlar/host-auth";

export async function SiteHeader() {
  const session = await getSession();
  let staff = false;
  let host = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { staffRole: true },
    });
    staff = Boolean(user && isStaffRole(user.staffRole, ["ADMIN", "MODERATOR"]));
    host = await isAuthorizedHost(session.user.id);
  }

  return (
    <header className="border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]">
          {ui.brand}
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
          <Link href="/uyeler" className="hover:text-[var(--ink)]">
            {ui.nav.members}
          </Link>
          <Link href="/topluluk" className="hover:text-[var(--ink)]">
            {ui.nav.community}
          </Link>
          <Link href="/bolumler" className="hover:text-[var(--ink)]">
            {ui.nav.episodes}
          </Link>
          {session?.user ? (
            <>
              <Link href="/mesajlar" className="hover:text-[var(--ink)]">
                {ui.nav.messages}
              </Link>
              <Link href="/arayanlar" className="hover:text-[var(--ink)]">
                {ui.nav.arayanlar}
              </Link>
              <Link href="/hesabim/profil" className="hover:text-[var(--ink)]">
                {ui.nav.profile}
              </Link>
              {host || staff ? (
                <Link href="/sunucu/basvurular" className="hover:text-[var(--ink)]">
                  {ui.nav.host}
                </Link>
              ) : null}
              {staff ? (
                <Link href="/yonetim" className="hover:text-[var(--ink)]">
                  {ui.nav.admin}
                </Link>
              ) : null}
              <form action={logoutAction}>
                <button type="submit" className="hover:text-[var(--ink)]">
                  {ui.nav.signOut}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/giris" className="hover:text-[var(--ink)]">
                {ui.nav.signIn}
              </Link>
              <Link
                href="/kayit"
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white hover:bg-[var(--accent-strong)]"
              >
                {ui.nav.signUp}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
