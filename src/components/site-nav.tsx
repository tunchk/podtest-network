"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { logoutAction } from "@/app/actions";
import { isNavActive, primaryNavMatchers, type NavMatchItem } from "@/lib/navigation/active-route";
import { ui } from "@/lib/ui-copy";

type NavItem = NavMatchItem & { label: string };

const PRIMARY: NavItem[] = [
  { href: "/uyeler", label: ui.nav.members, match: primaryNavMatchers.members },
  { href: "/topluluk", label: ui.nav.community, match: primaryNavMatchers.community },
  { href: "/bolumler", label: ui.nav.episodes, match: primaryNavMatchers.episodes },
  { href: "/is-ilanlari", label: ui.nav.jobs, match: primaryNavMatchers.jobs },
  { href: "/arayanlar", label: ui.nav.arayanlar, match: primaryNavMatchers.arayanlar },
];

function isActive(path: string, item: NavItem) {
  return isNavActive(path, item);
}

function navClass(active: boolean) {
  return active
    ? "text-[var(--ink)] font-semibold underline decoration-2 underline-offset-4"
    : "text-[var(--muted)] hover:text-[var(--ink)]";
}

function focusRing() {
  return "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2";
}

export function SiteNav({
  signedIn,
  staff,
  host,
  notificationUnread,
  messageUnread,
  accountLabel,
}: {
  signedIn: boolean;
  staff: boolean;
  host: boolean;
  notificationUnread: number;
  messageUnread: number;
  accountLabel: string;
}) {
  const pathname = usePathname() || "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const mobileId = useId();
  const accountId = useId();
  const mobilePanelRef = useRef<HTMLDivElement | null>(null);
  const accountPanelRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    queueMicrotask(() => menuButtonRef.current?.focus());
  }, []);

  const closeAccount = useCallback(() => {
    setAccountOpen(false);
    queueMicrotask(() => accountButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen && !accountOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (mobileOpen) closeMobile();
        if (accountOpen) closeAccount();
      }
    }
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (accountOpen && accountPanelRef.current && !accountPanelRef.current.contains(t) && !accountButtonRef.current?.contains(t)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [mobileOpen, accountOpen, closeMobile, closeAccount]);

  useEffect(() => {
    if (!mobileOpen) return;
    const first = mobilePanelRef.current?.querySelector<HTMLElement>("a, button");
    first?.focus();
  }, [mobileOpen]);

  function onAccountKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAccountOpen(true);
      queueMicrotask(() => accountPanelRef.current?.querySelector<HTMLElement>("a, button")?.focus());
    }
  }

  const accountLinks: Array<{ href: string; label: string } | null> = signedIn
    ? [
        { href: "/hesabim/profil", label: ui.nav.profile },
        { href: "/isveren", label: ui.nav.employerArea },
        host || staff ? { href: "/sunucu/basvurular", label: ui.nav.hostArea } : null,
        staff ? { href: "/yonetim", label: ui.nav.admin } : null,
      ]
    : [];

  return (
    <header className="border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
        <Link
          href="/"
          className={`shrink-0 font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)] ${focusRing()}`}
        >
          {ui.brand}
        </Link>

        {/* Desktop primary */}
        <nav aria-label="Ana menü" className="hidden items-center gap-3 text-sm lg:flex">
          {PRIMARY.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${navClass(active)} ${focusRing()}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop utilities */}
        <div className="hidden items-center gap-3 text-sm lg:flex">
          {signedIn ? (
            <>
              <Link
                href="/mesajlar"
                className={`relative inline-flex items-center ${navClass(pathname.startsWith("/mesajlar"))} ${focusRing()}`}
                aria-current={pathname.startsWith("/mesajlar") ? "page" : undefined}
              >
                {ui.nav.messages}
                {messageUnread > 0 ? (
                  <span className="ml-1 min-w-[1.1rem] rounded-full bg-[var(--accent)] px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {messageUnread > 99 ? "99+" : messageUnread}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/bildirimler"
                className={`relative inline-flex items-center ${navClass(pathname.startsWith("/bildirimler"))} ${focusRing()}`}
                aria-current={pathname.startsWith("/bildirimler") ? "page" : undefined}
                aria-label={
                  notificationUnread > 0
                    ? `${ui.nav.notifications} (${notificationUnread} okunmamış)`
                    : ui.nav.notifications
                }
              >
                {ui.nav.notifications}
                {notificationUnread > 0 ? (
                  <span className="ml-1 min-w-[1.1rem] rounded-full bg-[var(--accent)] px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {notificationUnread > 99 ? "99+" : notificationUnread}
                  </span>
                ) : null}
              </Link>
              <div className="relative">
                <button
                  ref={accountButtonRef}
                  type="button"
                  className={`${navClass(pathname.startsWith("/hesabim") || pathname.startsWith("/isveren") || pathname.startsWith("/yonetim") || pathname.startsWith("/sunucu"))} ${focusRing()}`}
                  aria-expanded={accountOpen}
                  aria-controls={accountId}
                  aria-haspopup="menu"
                  onClick={() => setAccountOpen((v) => !v)}
                  onKeyDown={onAccountKeyDown}
                >
                  {ui.nav.account}
                </button>
                {accountOpen ? (
                  <div
                    id={accountId}
                    ref={accountPanelRef}
                    role="menu"
                    aria-label={ui.nav.account}
                    className="absolute right-0 z-40 mt-2 min-w-[12rem] rounded-lg border border-[var(--line)] bg-[var(--panel)] py-1 shadow-md"
                  >
                    <p className="border-b border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">
                      {accountLabel}
                    </p>
                    {accountLinks.map((item) =>
                      item ? (
                        <Link
                          key={item.href}
                          role="menuitem"
                          href={item.href}
                          className={`block px-3 py-2 text-sm ${navClass(isActive(pathname, item))} ${focusRing()}`}
                          onClick={() => setAccountOpen(false)}
                        >
                          {item.label}
                        </Link>
                      ) : null,
                    )}
                    <form action={logoutAction} className="border-t border-[var(--line)]">
                      <button
                        role="menuitem"
                        type="submit"
                        className={`block w-full px-3 py-2 text-left text-sm text-[var(--muted)] hover:text-[var(--ink)] ${focusRing()}`}
                      >
                        {ui.nav.signOut}
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <Link href="/giris" className={`${navClass(pathname === "/giris")} ${focusRing()}`}>
                {ui.nav.signIn}
              </Link>
              <Link
                href="/kayit"
                className={`rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white hover:bg-[var(--accent-strong)] ${focusRing()}`}
              >
                {ui.nav.signUp}
              </Link>
            </>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-2 lg:hidden">
          {signedIn ? (
            <>
              <Link
                href="/mesajlar"
                className={`relative p-2 text-[var(--muted)] ${focusRing()}`}
                aria-label={
                  messageUnread > 0 ? `${ui.nav.messages} (${messageUnread} yeni)` : ui.nav.messages
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 6h16v12H4z" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
                {messageUnread > 0 ? (
                  <span className="absolute right-0 top-0 min-w-[1rem] rounded-full bg-[var(--accent)] px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {messageUnread > 99 ? "99+" : messageUnread}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/bildirimler"
                className={`relative p-2 text-[var(--muted)] ${focusRing()}`}
                aria-label={
                  notificationUnread > 0
                    ? `${ui.nav.notifications} (${notificationUnread} okunmamış)`
                    : ui.nav.notifications
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
                  <path d="M10 19a2 2 0 0 0 4 0" />
                </svg>
                {notificationUnread > 0 ? (
                  <span className="absolute right-0 top-0 min-w-[1rem] rounded-full bg-[var(--accent)] px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {notificationUnread > 99 ? "99+" : notificationUnread}
                  </span>
                ) : null}
              </Link>
            </>
          ) : null}
          <button
            ref={menuButtonRef}
            type="button"
            className={`btn btn-ghost px-2 py-1 text-sm ${focusRing()}`}
            aria-expanded={mobileOpen}
            aria-controls={mobileId}
            onClick={() => setMobileOpen((v) => !v)}
          >
            Menü
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div
          id={mobileId}
          ref={mobilePanelRef}
          className="border-t border-[var(--line)] bg-[var(--panel)] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Gezinti menüsü"
        >
          <nav className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-3 text-sm" aria-label="Ana menü">
            {PRIMARY.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 ${navClass(active)} ${focusRing()}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => closeMobile()}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mx-auto max-w-5xl border-t border-[var(--line)] px-4 py-3 text-sm">
            {signedIn ? (
              <div className="flex flex-col gap-1">
                <p className="px-3 pb-1 text-xs text-[var(--muted)]">{accountLabel}</p>
                <Link
                  href="/mesajlar"
                  className={`rounded-md px-3 py-2 ${navClass(pathname.startsWith("/mesajlar"))} ${focusRing()}`}
                  onClick={() => closeMobile()}
                >
                  {ui.nav.messages}
                  {messageUnread > 0 ? ` (${messageUnread})` : ""}
                </Link>
                <Link
                  href="/bildirimler"
                  className={`rounded-md px-3 py-2 ${navClass(pathname.startsWith("/bildirimler"))} ${focusRing()}`}
                  onClick={() => closeMobile()}
                >
                  {ui.nav.notifications}
                  {notificationUnread > 0 ? ` (${notificationUnread})` : ""}
                </Link>
                {accountLinks.map((item) =>
                  item ? (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-md px-3 py-2 ${navClass(isActive(pathname, item))} ${focusRing()}`}
                      onClick={() => closeMobile()}
                    >
                      {item.label}
                    </Link>
                  ) : null,
                )}
                <form action={logoutAction}>
                  <button type="submit" className={`w-full rounded-md px-3 py-2 text-left text-[var(--muted)] ${focusRing()}`}>
                    {ui.nav.signOut}
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link href="/giris" className={`rounded-md px-3 py-2 ${focusRing()}`} onClick={() => closeMobile()}>
                  {ui.nav.signIn}
                </Link>
                <Link href="/kayit" className={`btn btn-primary ${focusRing()}`} onClick={() => closeMobile()}>
                  {ui.nav.signUp}
                </Link>
              </div>
            )}
            <button type="button" className={`mt-3 text-sm text-[var(--muted)] ${focusRing()}`} onClick={closeMobile}>
              Kapat
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
