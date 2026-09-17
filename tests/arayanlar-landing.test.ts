import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  hasActiveArayanlarApplication,
  kariyerPortresiLanding,
} from "@/lib/arayanlar/landing-copy";
import { RECORDING_FORMAT_STEPS, FIXED_CLOSING_QUESTION } from "@/lib/arayanlar/artifact-schema";
import { arayanlarEntryCta } from "@/lib/arayanlar/entry-cta";
import { ui } from "@/lib/ui-copy";

const root = path.resolve(__dirname, "..");

function readSrc(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Kariyer Portresi landing copy", () => {
  it("brands as Kariyer Portresi and keeps the core thesis", () => {
    expect(kariyerPortresiLanding.brand).toBe("Kariyer Portresi");
    expect(kariyerPortresiLanding.hero.line1).toBe("CV ne yaptığını söylüyor.");
    expect(kariyerPortresiLanding.hero.line2).toMatch(/nasıl düşündüğünü/);
    expect(kariyerPortresiLanding.hero.reassurance).toBe("Bu bir iş görüşmesi değil.");
    expect(kariyerPortresiLanding.hero.primaryCta).toBe("Kariyer Portresi'ne başvur");
    expect(kariyerPortresiLanding.notInterview.title).toBe("Bu bir iş görüşmesi değil.");
  });

  it("renders the six fixed recording steps and closing question", () => {
    expect(kariyerPortresiLanding.process.steps.map((s) => s.title)).toEqual([
      ...RECORDING_FORMAT_STEPS,
    ]);
    expect(kariyerPortresiLanding.process.steps).toHaveLength(6);
    expect(kariyerPortresiLanding.process.steps[5]?.body).toBe(FIXED_CLOSING_QUESTION);
  });

  it("does not use old user-facing Arayanlar product label or hype language", () => {
    const blob = JSON.stringify(kariyerPortresiLanding);
    expect(blob).not.toMatch(/\bArayanlar\b/);
    expect(blob).not.toMatch(/unlock your potential|stand out from the crowd|AI-powered|revolutionize|next-generation hiring/i);
    expect(blob).not.toMatch(/score|ranking|match percentage|assessment result/i);
  });

  it("marks active application states correctly for landing vs app shell", () => {
    expect(hasActiveArayanlarApplication(null)).toBe(false);
    expect(hasActiveArayanlarApplication({ status: "WITHDRAWN" })).toBe(false);
    expect(hasActiveArayanlarApplication({ status: "DRAFT" })).toBe(true);
    expect(hasActiveArayanlarApplication({ status: "AWAITING_CONFIRMATION" })).toBe(true);
    expect(hasActiveArayanlarApplication({ status: "SUBMITTED" })).toBe(true);
  });
});

describe("Kariyer Portresi /arayanlar page wiring", () => {
  it("page uses landing + preserves guest flow and entry CTA", () => {
    const page = readSrc("src/app/arayanlar/page.tsx");
    expect(page).toMatch(/KariyerPortresiLanding/);
    expect(page).toMatch(/KariyerPortresiApplicationHeader/);
    expect(page).toMatch(/hasActiveArayanlarApplication/);
    expect(page).toMatch(/ArayanlarGuestFlow/);
    expect(page).toMatch(/arayanlarEntryCta/);
    expect(page).toMatch(/#basvuru|id=\{activeApplication \? "basvuru"/);
  });

  it("landing component exposes primary CTA into existing application flow and informational secondary", () => {
    const src = readSrc("src/components/arayanlar/kariyer-portresi-landing.tsx");
    expect(src).toMatch(/Kariyer Portresi/);
    expect(src).toMatch(/copy\.hero\.primaryCta|applyLabel/);
    expect(src).toMatch(/#\$\{copy\.process\.id\}|#kayit-nasil/);
    expect(src).toMatch(/btn btn-ghost/);
    expect(src).toMatch(/copy\.notInterview\.title|copy\.hero\.reassurance/);
    // Informational CTAs are links/anchors — no fetch/mutation
    expect(src).not.toMatch(/fetch\(|withdraw|submitApplication|POST/);
    expect(src).not.toMatch(/\bArayanlar\b/);
    // Mobile-safe wrapping helpers present
    expect(src).toMatch(/break-words|min-w-0|flex-wrap/);
  });

  it("primary apply CTA still routes into #basvuru / existing flow states", () => {
    expect(ui.arayanlar.apply).toBe("Kariyer Portresi'ne başvur");
    expect(ui.arayanlar.title).toBe("Kariyer Portresi");
    expect(arayanlarEntryCta(null)).toEqual({
      href: "#basvuru",
      label: "Kariyer Portresi'ne başvur",
    });
    expect(arayanlarEntryCta({ status: "DRAFT", prepStatus: null })?.href).toBe("#basvuru");
    expect(arayanlarEntryCta({ status: "SUBMITTED", prepStatus: "READY" })?.href).toBe(
      "/arayanlar/hazirligim",
    );
    expect(arayanlarEntryCta({ status: "SUBMITTED", prepStatus: "QUEUED" })?.href).toBe(
      "#basvuru",
    );
  });

  it("landing process section id matches secondary CTA scroll target", () => {
    expect(kariyerPortresiLanding.process.id).toBe("kayit-nasil");
    const src = readSrc("src/components/arayanlar/kariyer-portresi-landing.tsx");
    expect(src).toContain("copy.process.id");
  });
});
