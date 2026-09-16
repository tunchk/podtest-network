import { describe, expect, it } from "vitest";
import {
  ARAYANLAR_PREP_MODEL_DEFAULT,
  ARAYANLAR_PREP_REASONING_EFFORT,
  resolveArayanlarPrepModel,
} from "@/lib/arayanlar/prep-model";

describe("arayanlar prep model config", () => {
  it("defaults to gpt-5.6-sol with medium reasoning", () => {
    const prev = process.env.ARAYANLAR_PREP_MODEL;
    delete process.env.ARAYANLAR_PREP_MODEL;
    expect(resolveArayanlarPrepModel()).toBe(ARAYANLAR_PREP_MODEL_DEFAULT);
    expect(ARAYANLAR_PREP_MODEL_DEFAULT).toBe("gpt-5.6-sol");
    expect(ARAYANLAR_PREP_REASONING_EFFORT).toBe("medium");
    if (prev === undefined) delete process.env.ARAYANLAR_PREP_MODEL;
    else process.env.ARAYANLAR_PREP_MODEL = prev;
  });

  it("honors ARAYANLAR_PREP_MODEL override without falling back to OPENAI_MODEL", () => {
    const prevPrep = process.env.ARAYANLAR_PREP_MODEL;
    const prevOpen = process.env.OPENAI_MODEL;
    process.env.ARAYANLAR_PREP_MODEL = "gpt-test-override";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
    expect(resolveArayanlarPrepModel()).toBe("gpt-test-override");
    if (prevPrep === undefined) delete process.env.ARAYANLAR_PREP_MODEL;
    else process.env.ARAYANLAR_PREP_MODEL = prevPrep;
    if (prevOpen === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = prevOpen;
  });
});
