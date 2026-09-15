import { describe, expect, it } from "vitest";
import { evaluateCapability, CAPABILITY_CATALOG } from "@/lib/capabilities/catalog";

describe("capability evaluator", () => {
  it("denies unknown capabilities by default", () => {
    const result = evaluateCapability({
      capabilityKey: "not.a.real.capability",
      grants: [],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("unknown_capability");
  });

  it("denies known capabilities without grants", () => {
    const result = evaluateCapability({
      capabilityKey: "ai.profile.prepare",
      grants: [],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_entitled");
  });

  it("allows active grants", () => {
    const result = evaluateCapability({
      capabilityKey: "hiring.search.advanced",
      grants: [
        {
          capabilityKey: "hiring.search.advanced",
          source: "DEV_SEED",
          expiresAt: null,
          revokedAt: null,
        },
      ],
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("granted");
  });

  it("rejects expired grants", () => {
    const result = evaluateCapability({
      capabilityKey: "ai.arayanlar.prepare",
      grants: [
        {
          capabilityKey: "ai.arayanlar.prepare",
          source: "DEV_SEED",
          expiresAt: new Date("2020-01-01"),
          revokedAt: null,
        },
      ],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("allows FREE baseline catalog keys without an explicit grant", () => {
    const result = evaluateCapability({
      capabilityKey: "network.message_request.create",
      grants: [],
      baselinePlan: "FREE",
    });
    expect(result.allowed).toBe(true);
    expect(result.source).toBe("baseline:FREE");
  });

  it("still denies PLUS-only keys on FREE baseline", () => {
    const result = evaluateCapability({
      capabilityKey: "ai.profile.prepare",
      grants: [],
      baselinePlan: "FREE",
    });
    expect(result.allowed).toBe(false);
  });

  it("documents PLUS and EMPLOYER future plan keys", () => {
    expect(CAPABILITY_CATALOG["catchy.practice.access"].plans).toContain("PLUS");
    expect(CAPABILITY_CATALOG["hiring.search.advanced"].plans).toContain("EMPLOYER");
  });
});
