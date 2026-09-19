import { ui } from "@/lib/ui-copy";

export type AccountMenuLink = {
  href: string;
  label: string;
};

/**
 * Permission-aware Hesabım menu links.
 * Unauthorized sections are omitted entirely (never rendered as disabled/ghost).
 */
export function buildAccountMenuItems(options: {
  employer: boolean;
  host: boolean;
  staff: boolean;
}): AccountMenuLink[] {
  const items: AccountMenuLink[] = [{ href: "/hesabim/profil", label: ui.nav.profile }];

  if (options.employer) {
    items.push({ href: "/isveren", label: ui.nav.employerArea });
  }

  if (options.host || options.staff) {
    items.push({ href: "/sunucu/basvurular", label: ui.nav.hostArea });
  }

  if (options.staff) {
    items.push({ href: "/yonetim", label: ui.nav.admin });
  }

  return items;
}

/** True when the account trigger should show as “in account area”. */
export function isAccountAreaPath(pathname: string) {
  return (
    pathname.startsWith("/hesabim") ||
    pathname.startsWith("/isveren") ||
    pathname.startsWith("/yonetim") ||
    pathname.startsWith("/sunucu")
  );
}
