import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function readSrc(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("basvurum state priority hardening", () => {
  const src = readSrc("src/app/arayanlar/basvurum/page.tsx");

  it("hides schedule when publication surfaces are active", () => {
    expect(src).toMatch(/showSchedule/);
    expect(src).toMatch(/!showPublication/);
    expect(src).toMatch(/primaryStatusLabel/);
  });

  it("does not show READY prep CTAs while publication is the primary state", () => {
    expect(src).toMatch(/showPrepActions/);
    expect(src).toMatch(/!showPublication && facing === "READY"/);
  });

  it("distinguishes approved-waiting from awaiting-candidate-approval", () => {
    expect(src).toMatch(/Yayın onayın alındı — ekip yayına alacak/);
    expect(src).toMatch(/Yayın onayın bekleniyor/);
  });
});

describe("host publish affordance hardening", () => {
  it("publication panel requires canPublish for enabled Yayına al", () => {
    const src = readSrc("src/components/arayanlar/host-publication-panel.tsx");
    expect(src).toMatch(/canPublish/);
    expect(src).toMatch(/publishBlockedReason/);
    expect(src).toMatch(/Yayına alma için yönetim yetkisi gerekir/);
  });

  it("ops page passes actor admin flag into publication initial", () => {
    const src = readSrc("src/app/sunucu/basvurular/[id]/page.tsx");
    expect(src).toMatch(/actorIsAdmin:\s*view\.actor\.isAdmin/);
  });
});

describe("withdraw after publish guard", () => {
  it("service rejects published withdraw with ALREADY_PUBLISHED", () => {
    const src = readSrc("src/lib/arayanlar/service.ts");
    expect(src).toMatch(/ALREADY_PUBLISHED/);
    expect(src).toMatch(/Yayımlanmış Kariyer Portresi başvurusu geri çekilemez/);
    expect(src).toMatch(/publicationReviewRequestedAt:\s*null/);
  });
});

describe("guest brief must not leak host preparation", () => {
  it("getGuestBriefForMember return shape omits preparation", () => {
    const src = readSrc("src/lib/arayanlar/service.ts");
    expect(src).toMatch(/Guest-safe only/);
    expect(src).not.toMatch(/brief: parsed\.view,\n\s*preparation:/);
  });

  it("reconcile heal does not notify on GET", () => {
    const src = readSrc("src/lib/arayanlar/service.ts");
    const start = src.indexOf("export async function reconcileArayanlarPrepStatusFromJob");
    const end = src.indexOf("export async function getGuestBriefForMember");
    const body = src.slice(start, end);
    expect(body).toMatch(/Do not notify here/);
    expect(body).not.toMatch(/notifyArayanlarPrepReady/);
  });
});

describe("Kariyer publish gate on shared episode update", () => {
  it("requires KP candidate approval even without confirmed appearances", () => {
    const src = readSrc("src/lib/community/episodes.ts");
    expect(src).toMatch(/publicationEpisodeId: existing\.id/);
    expect(src).toMatch(/artworkUrl/);
  });

  it("includes artworkUrl in publication version hash", () => {
    const src = readSrc("src/lib/legal/service.ts");
    expect(src).toMatch(/artworkUrl: episode\.artworkUrl/);
  });

  it("does not forge memberAcceptedAt on send-for-approval", () => {
    const src = readSrc("src/lib/arayanlar/publication.ts");
    expect(src).toMatch(/memberAcceptedAt: null/);
    expect(src).toMatch(/EPISODE_FORBIDDEN/);
  });
});
