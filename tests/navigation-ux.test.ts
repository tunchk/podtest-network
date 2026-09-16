import { describe, expect, it } from "vitest";
import { isNavActive, primaryNavMatchers } from "@/lib/navigation/active-route";
import { arayanlarEntryCta } from "@/lib/arayanlar/entry-cta";
import { ui } from "@/lib/ui-copy";

describe("primary nav active matching", () => {
  it("marks nested member profiles under Üyeler", () => {
    expect(isNavActive("/u/someone", { href: "/uyeler", match: primaryNavMatchers.members })).toBe(
      true,
    );
    expect(isNavActive("/uyeler", { href: "/uyeler", match: primaryNavMatchers.members })).toBe(true);
    expect(isNavActive("/bolumler", { href: "/uyeler", match: primaryNavMatchers.members })).toBe(
      false,
    );
  });

  it("marks nested community and episode routes", () => {
    expect(
      isNavActive("/topluluk/sor", { href: "/topluluk", match: primaryNavMatchers.community }),
    ).toBe(true);
    expect(
      isNavActive("/bolumler/ornek-slug", { href: "/bolumler", match: primaryNavMatchers.episodes }),
    ).toBe(true);
    expect(
      isNavActive("/arayanlar/hazirligim", {
        href: "/arayanlar",
        match: primaryNavMatchers.arayanlar,
      }),
    ).toBe(true);
  });

  it("uses prefix matching for account utility hrefs", () => {
    expect(isNavActive("/hesabim/profil", { href: "/hesabim/profil" })).toBe(true);
    expect(isNavActive("/hesabim/profil?sekme=cv", { href: "/hesabim/profil" })).toBe(false);
    expect(isNavActive("/isveren/ilanlar", { href: "/isveren" })).toBe(true);
  });
});

describe("arayanlar entry CTA", () => {
  it("offers Başvur when there is no application", () => {
    expect(arayanlarEntryCta(null)?.label).toBe(ui.arayanlar.apply);
  });

  it("continues draft and awaiting confirmation", () => {
    expect(arayanlarEntryCta({ status: "DRAFT", prepStatus: null })?.label).toBe(
      ui.arayanlar.continue,
    );
    expect(
      arayanlarEntryCta({ status: "AWAITING_CONFIRMATION", prepStatus: null })?.label,
    ).toBe(ui.arayanlar.continue);
  });

  it("opens preparation when ready", () => {
    const cta = arayanlarEntryCta({ status: "SUBMITTED", prepStatus: "READY" });
    expect(cta?.label).toBe(ui.arayanlar.viewPrep);
    expect(cta?.href).toBe("/arayanlar/hazirligim");
  });

  it("shows status while preparing or failed", () => {
    expect(arayanlarEntryCta({ status: "SUBMITTED", prepStatus: "QUEUED" })?.label).toBe(
      ui.arayanlar.viewStatus,
    );
    expect(arayanlarEntryCta({ status: "SUBMITTED", prepStatus: "FAILED" })?.note).toMatch(
      /tamamlanamadı/,
    );
  });

  it("restarts after withdraw without inventing a new application", () => {
    const cta = arayanlarEntryCta({ status: "WITHDRAWN", prepStatus: null });
    expect(cta?.label).toBe(ui.arayanlar.restart);
    expect(cta?.href).toBe("#basvuru");
  });
});
