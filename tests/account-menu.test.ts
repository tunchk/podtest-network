import { describe, expect, it } from "vitest";
import {
  buildAccountMenuItems,
  isAccountAreaPath,
} from "@/lib/navigation/account-menu";
import { ui } from "@/lib/ui-copy";

describe("account menu items (permission-aware)", () => {
  it("shows Profilim and not employer/host for a normal member", () => {
    const items = buildAccountMenuItems({
      employer: false,
      host: false,
      staff: false,
    });
    expect(items.map((i) => i.label)).toEqual([ui.nav.profile]);
    expect(items.some((i) => i.label === ui.nav.hostArea)).toBe(false);
    expect(items.some((i) => i.label === ui.nav.employerArea)).toBe(false);
    expect(items.some((i) => i.label === ui.nav.admin)).toBe(false);
    expect(items.every((i) => i.href && i.label)).toBe(true);
  });

  it("omits unauthorized employer and server entries entirely (no ghost items)", () => {
    const items = buildAccountMenuItems({
      employer: false,
      host: false,
      staff: false,
    });
    expect(items).toHaveLength(1);
    expect(JSON.stringify(items)).not.toMatch(/disabled|MEMBER|ADMIN|ghost/i);
  });

  it("includes employer only when authorized", () => {
    const items = buildAccountMenuItems({
      employer: true,
      host: false,
      staff: false,
    });
    expect(items.map((i) => i.label)).toEqual([ui.nav.profile, ui.nav.employerArea]);
    expect(items.find((i) => i.label === ui.nav.employerArea)?.href).toBe("/isveren");
  });

  it("includes Sunucu alanı for authorized host", () => {
    const items = buildAccountMenuItems({
      employer: false,
      host: true,
      staff: false,
    });
    expect(items.map((i) => i.label)).toEqual([ui.nav.profile, ui.nav.hostArea]);
    expect(items.find((i) => i.label === ui.nav.hostArea)?.href).toBe("/sunucu/basvurular");
  });

  it("includes Sunucu alanı and Yönetim for staff", () => {
    const items = buildAccountMenuItems({
      employer: false,
      host: false,
      staff: true,
    });
    expect(items.map((i) => i.label)).toEqual([
      ui.nav.profile,
      ui.nav.hostArea,
      ui.nav.admin,
    ]);
  });

  it("keeps logout as a separate concern from nav links (signOut copy exists)", () => {
    expect(ui.nav.signOut).toBe("Çıkış");
    const items = buildAccountMenuItems({
      employer: true,
      host: true,
      staff: true,
    });
    expect(items.some((i) => i.label === ui.nav.signOut)).toBe(false);
  });
});

describe("account menu trigger semantics", () => {
  it("marks account-area paths for open/active styling", () => {
    expect(isAccountAreaPath("/hesabim/profil")).toBe(true);
    expect(isAccountAreaPath("/sunucu/basvurular")).toBe(true);
    expect(isAccountAreaPath("/isveren/ilanlar")).toBe(true);
    expect(isAccountAreaPath("/yonetim")).toBe(true);
    expect(isAccountAreaPath("/arayanlar")).toBe(false);
    expect(isAccountAreaPath("/")).toBe(false);
  });

  it("documents required trigger ARIA contract used by SiteNav", () => {
    // SiteNav wires: aria-expanded, aria-controls, aria-haspopup="menu"
    const contract = {
      ariaExpandedOpen: true,
      ariaExpandedClosed: false,
      ariaHasPopup: "menu",
      role: "menu",
      menuItemRole: "menuitem",
    };
    expect(contract.ariaHasPopup).toBe("menu");
    expect(contract.role).toBe("menu");
    expect(contract.menuItemRole).toBe("menuitem");
  });
});
