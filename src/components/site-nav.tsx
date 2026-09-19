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
import {
  buildAccountMenuItems,
  isAccountAreaPath,
} from "@/lib/navigation/account-menu";
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

function menuItemClass(active: boolean) {
  return [
    "block w-full rounded-md px-3 py-2 text-left text-sm outline-none",
    "focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1",
    active
      ? "bg-[var(--accent-soft)] font-semibold text-[var(--ink)]"
      : "text-[var(--ink)] hover:bg-[color-mix(in_oklab,var(--accent-soft)_70%,var(--panel))]",
  ].join(" ");
}

function AccountChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiteNav({
  signedIn,
  staff,
  host,
  employer,
  notificationUnread,
  messageUnread,
  accountLabel,
  accountEmail,
}: {
  signedIn: boolean;
  staff: boolean;
  host: boolean;
  employer: boolean;
  notificationUnread: number;
  messageUnread: number;
  accountLabel: string;
  accountEmail?: string;
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
  const openAccountViaKeyboardRef = useRef(false);

  const accountLinks = signedIn
    ? buildAccountMenuItems({ employer, host, staff })
    : [];

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
      if (
        accountOpen &&
        accountPanelRef.current &&
        !accountPanelRef.current.contains(t) &&
        !accountButtonRef.current?.contains(t)
      ) {
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

  useEffect(() => {
    if (!accountOpen || !openAccountViaKeyboardRef.current) return;
    openAccountViaKeyboardRef.current = false;
    const first = accountPanelRef.current?.querySelector<HTMLElement>("[role='menuitem']");
    first?.focus();
  }, [accountOpen]);

  function focusAccountItem(offset: number) {
    const items = Array.from(
      accountPanelRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [],
    );
    if (!items.length) return;
    const current = document.activeElement as HTMLElement | null;
    const idx = Math.max(0, items.indexOf(current as HTMLElement));
    const next = items[(idx + offset + items.length) % items.length];
    next?.focus();
  }

  function onAccountKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!accountOpen) {
        openAccountViaKeyboardRef.current = true;
        setAccountOpen(true);
        return;
      }
      focusAccountItem(1);
    }
    if (e.key === "ArrowUp" && accountOpen) {
      e.preventDefault();
      focusAccountItem(-1);
    }
    if (e.key === "Home" && accountOpen) {
      e.preventDefault();
      accountPanelRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    }
  }

  function onAccountMenuKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusAccountItem(1);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      focusAccountItem(-1);
    }
    if (e.key === "Home") {
      e.preventDefault();
      accountPanelRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']")[0]?.focus();
    }
    if (e.key === "End") {
      e.preventDefault();
      const items = accountPanelRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']");
      items?.[items.length - 1]?.focus();
    }
  }

  const accountAreaActive = isAccountAreaPath(pathname);
  const triggerClass = accountOpen || accountAreaActive
    ? "text-[var(--ink)] font-semibold"
    : "text-[var(--muted)] hover:text-[var(--ink)]";

  return (
    <header className="relative z-50 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] backdrop-blur-md">
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
                  className={`inline-flex min-h-9 items-center gap-1 rounded-md px-2 py-1.5 ${triggerClass} ${focusRing()}`}
                  aria-expanded={accountOpen}
                  aria-controls={accountId}
                  aria-haspopup="menu"
                  onClick={() => setAccountOpen((v) => !v)}
                  onKeyDown={onAccountKeyDown}
                >
                  {ui.nav.account}
                  <AccountChevron open={accountOpen} />
                </button>
                {accountOpen ? (
                  <div
                    id={accountId}
                    ref={accountPanelRef}
                    role="menu"
                    aria-label={ui.nav.account}
                    onKeyDown={onAccountMenuKeyDown}
                    className="absolute right-0 top-full z-50 mt-1.5 w-[min(15.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] py-1.5 shadow-[0_10px_28px_rgba(20,33,43,0.14)]"
                  >
                    <div className="border-b border-[var(--line)] px-3 py-2">
                      <p className="truncate text-xs font-medium text-[var(--ink)]">{accountLabel}</p>
                      {accountEmail ? (
                        <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{accountEmail}</p>
                      ) : null}
                    </div>
                    <div className="px-1 py-1">
                      {accountLinks.map((item) => {
                        const active = isActive(pathname, item);
                        return (
                          <Link
                            key={item.href}
                            role="menuitem"
                            href={item.href}
                            className={menuItemClass(active)}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setAccountOpen(false)}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                    <div className="border-t border-[var(--line)] px-1 pt-1">
                      <form action={logoutAction}>
                        <button
                          role="menuitem"
                          type="submit"
                          className={`${menuItemClass(false)} text-[color-mix(in_oklab,var(--danger)_78%,var(--ink))] hover:bg-[color-mix(in_oklab,var(--danger)_8%,var(--panel))]`}
                        >
                          {ui.nav.signOut}
                        </button>
                      </form>
                    </div>
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
                  className={`rounded-md px-3 py-2.5 ${navClass(active)} ${focusRing()}`}
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
                <div className="px-3 pb-2">
                  <p className="text-xs font-medium text-[var(--ink)]">{accountLabel}</p>
                  {accountEmail ? (
                    <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{accountEmail}</p>
                  ) : null}
                </div>
                <Link
                  href="/mesajlar"
                  className={`rounded-md px-3 py-2.5 ${navClass(pathname.startsWith("/mesajlar"))} ${focusRing()}`}
                  onClick={() => closeMobile()}
                >
                  {ui.nav.messages}
                  {messageUnread > 0 ? ` (${messageUnread})` : ""}
                </Link>
                <Link
                  href="/bildirimler"
                  className={`rounded-md px-3 py-2.5 ${navClass(pathname.startsWith("/bildirimler"))} ${focusRing()}`}
                  onClick={() => closeMobile()}
                >
                  {ui.nav.notifications}
                  {notificationUnread > 0 ? ` (${notificationUnread})` : ""}
                </Link>
                {accountLinks.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-md px-3 py-2.5 text-[var(--ink)] ${active ? "font-semibold bg-[var(--accent-soft)]" : "hover:bg-[var(--surface)]"} ${focusRing()}`}
                      onClick={() => closeMobile()}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                <form action={logoutAction} className="mt-1 border-t border-[var(--line)] pt-1">
                  <button
                    type="submit"
                    className={`w-full rounded-md px-3 py-2.5 text-left text-[color-mix(in_oklab,var(--danger)_78%,var(--ink))] ${focusRing()}`}
                  >
                    {ui.nav.signOut}
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link href="/giris" className={`rounded-md px-3 py-2.5 ${focusRing()}`} onClick={() => closeMobile()}>
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
