import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ui } from "@/lib/ui-copy";

const root = path.resolve(__dirname, "..");

function readSrc(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("homepage landing polish", () => {
  const src = readSrc("src/components/home/home-landing.tsx");
  const page = readSrc("src/app/page.tsx");

  it("wires homepage to HomeLanding and recent episodes", () => {
    expect(page).toMatch(/listLatestPublishedEpisodes/);
    expect(page).toMatch(/HomeLanding/);
  });

  it("uses primary CTA to /kayit with primary button semantics only once", () => {
    expect(src).toMatch(/href="\/kayit"/);
    expect(src).toMatch(/btn-primary/);
    expect(src).toMatch(/landing\.ctaJoin|ctaJoin/);
    const primaryMatches = src.match(/btn-primary/g) ?? [];
    expect(primaryMatches.length).toBe(1);
  });

  it("uses secondary CTA to /bolumler without primary weight", () => {
    expect(src).toMatch(/href="\/bolumler"/);
    expect(src).toMatch(/btn-ghost/);
    expect(src).not.toMatch(/href="\/bolumler"[^>]*btn-primary/);
  });

  it("uses tertiary Kariyer Portresi CTA as lighter action to /arayanlar", () => {
    expect(src).toMatch(/href="\/arayanlar"/);
    expect(src).toMatch(/home-cta-tertiary/);
    expect(src).not.toMatch(/href="\/arayanlar"[^>]*btn-primary/);
    expect(src).not.toMatch(/href="\/arayanlar"[^>]*btn-secondary/);
  });

  it("keeps screenshot-ready hero with compact Ne var? and split reassurance", () => {
    expect(src).toMatch(/hero-what-heading/);
    expect(src).toMatch(/home-reassurance/);
    expect(src).toMatch(/landing\.heroWhat|heroWhat/);
    expect(ui.landing.heroWhat.community.body.length).toBeLessThan(
      ui.landing.what.community.body.length,
    );
  });

  it("preserves sensible heading hierarchy", () => {
    expect(src).toMatch(/<h1[\s>]/);
    expect(src).toMatch(/id="hero-what-heading"/);
    expect(src).toMatch(/id="what-heading"/);
    expect(src).toMatch(/id="latest-episodes-heading"/);
    expect(src.match(/<h1[\s>]/g)?.length).toBe(1);
  });

  it("marks decorative hero motif as aria-hidden", () => {
    expect(src).toMatch(/aria-hidden="true"/);
  });

  it("exposes expected CTA labels from ui-copy", () => {
    expect(ui.landing.ctaJoin).toBe("Topluluğa katıl");
    expect(ui.landing.ctaEpisodes).toBe("Bölümleri keşfet");
    expect(ui.landing.ctaArayanlar).toMatch(/Kariyer Portresi/);
  });
});
