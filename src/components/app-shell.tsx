import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ui } from "@/lib/ui-copy";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-[var(--line)] py-6 text-center text-xs text-[var(--muted)]">
        {ui.common.footer} ·{" "}
        <Link href="/yasal" className="underline">
          Yasal
        </Link>
      </footer>
    </div>
  );
}
