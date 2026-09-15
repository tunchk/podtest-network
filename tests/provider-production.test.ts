import { afterEach, describe, expect, it } from "vitest";
import {
  isProductionRuntime,
  prepareProfileFromCv,
  resolveProviderConfig,
  resolveProviderMode,
} from "@/lib/ai/provider";

const original = { ...process.env };

function setEnv(patch: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
});

describe("production provider configuration", () => {
  it("refuses stubs in production even when AI_ALLOW_STUB and AI_PROVIDER=stub are set", async () => {
    setEnv({
      NODE_ENV: "production",
      AI_PROVIDER: "stub",
      AI_ALLOW_STUB: "true",
      AI_DEMO_STUB: "true",
      OPENAI_API_KEY: undefined,
    });

    expect(isProductionRuntime()).toBe(true);
    expect(resolveProviderMode()).toBe("unavailable");

    const config = resolveProviderConfig();
    expect(config.mode).toBe("unavailable");
    expect(config.demoStub).toBe(false);
    expect(config.errorCode).toBe("invalid_production_provider_config");

    const result = await prepareProfileFromCv({
      cvText: "Synthetic CV\nSkills: Testing",
      currentProfile: {
        displayName: "Test",
        headline: null,
        bio: null,
        skills: [],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_production_provider_config");
      expect(result.mode).toBe("unavailable");
    }
  });

  it("rejects unsupported production AI_PROVIDER values", () => {
    setEnv({
      NODE_ENV: "production",
      AI_PROVIDER: "anthropic",
      AI_ALLOW_STUB: undefined,
      AI_DEMO_STUB: undefined,
      OPENAI_API_KEY: "sk-test-not-used",
    });
    const config = resolveProviderConfig();
    expect(config.mode).toBe("unavailable");
    expect(config.errorCode).toBe("invalid_production_provider_config");
  });
});
