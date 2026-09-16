import { describe, expect, it } from "vitest";
import {
  FIXED_CLOSING_QUESTION,
  PREPARATION_SCHEMA_VERSION,
  arayanlarPrepareOutputSchema,
  parseStoredGuestArtifact,
  parseStoredHostArtifact,
  toGuestPrepView,
  toHostPrepView,
} from "@/lib/arayanlar/artifact-schema";
import { normalizeArayanlarOutput } from "@/lib/arayanlar/provider";
import {
  ARAYANLAR_PREP_MODEL_DEFAULT,
  resolveArayanlarPrepModel,
} from "@/lib/arayanlar/prep-model";

const facts = {
  displayName: "Ada",
  targetRole: "QA Lead",
  storyTopic: "Wallet domain kalite stratejisi",
  contribution: "Regresyon sınıflandırma sistemi",
  workPreferences: "hibrit",
  excludedTopics: "",
  contactChannel: "platform",
  profileHintsUsed: [],
};

function samplePrep(): {
  schemaVersion: typeof PREPARATION_SCHEMA_VERSION;
  preparation: import("@/lib/arayanlar/artifact-schema").ArayanlarPreparation;
} {
  return {
    schemaVersion: PREPARATION_SCHEMA_VERSION,
    preparation: {
      identityPrep: {
        profileSignals: [
          "Onaylı hedef: QA Lead",
          "Wallet domain kalite odağı",
          "Regresyon sınıflandırma katkısı",
        ],
        careerThemes: ["domain kalite stratejisi"],
        careerTransitions: ["uygulama testinden domain kaliteye"],
        confirmedFacts: ["Hedef rol: QA Lead"],
        missingInformation: ["Ölçülebilir sonuç belirtilmemiş"],
        guestPrepQuestions: ["Kimliğini hangi iki kanıtla anlatırsın?"],
        hostQuestions: ["Bugün kendini hangi rolle tanımlıyorsun?"],
      },
      storyCandidates: [
        {
          title: "Wallet regresyon sınıflandırma",
          sourceExperience: "Wallet domain / kalite stratejisi",
          whyThisCouldBeAStory: "Belirsizlik ve trade-off potansiyeli var; sonuç metrikleri eksik.",
          knownFacts: ["Wallet domain", "Regresyon sınıflandırma"],
          missingDetails: ["Ölçülebilir before/after yok"],
          guestPrepQuestions: ["Somut olarak ne değişti?"],
          hostQuestions: ["Asıl zorluk neydi?"],
          followUpQuestions: ["Senin kararın neydi?"],
          sourceReferences: ["submitted_facts.storyTopic"],
        },
        {
          title: "Kalite stratejisi dönüşümü",
          sourceExperience: "QA Lead hedef yönü",
          whyThisCouldBeAStory: "Rol/kapsam değişimi sinyali.",
          knownFacts: ["QA Lead hedefi"],
          missingDetails: ["Geçiş zamanı / tetikleyici belirsiz"],
          guestPrepQuestions: ["Bu geçişi ne tetikledi?"],
          hostQuestions: ["Kapsam nasıl değişti?"],
          followUpQuestions: [],
          sourceReferences: ["submitted_facts.targetRole"],
        },
      ],
      thinkingScenario: {
        scenario: "Regresyonlar artıyor, metrik eksik, sprint baskısı var.",
        whyItFitsThisCandidate: "QA Lead + Wallet kalite bağlamına uyuyor.",
        whatTheHostShouldListenFor: ["Netleştirme", "Risk önceliği"],
        constraints: ["Eksik metrik"],
      },
      jobSearchPrep: {
        knownPreferences: ["hibrit"],
        inferredButUnconfirmed: [],
        missingInformation: ["People-management tercihi"],
        guestPrepQuestions: ["Aradığın ekip tipini nasıl tanımlarsın?"],
        hostQuestions: ["Ne arıyorsun?"],
      },
      rapidFire: [
        { question: "Kalite sinyalini nasıl ayırırsın?", whyThisQuestionFits: "QA Lead" },
        { question: "Otomasyonda bilerek yapmayacağın?", whyThisQuestionFits: "Trade-off" },
        { question: "Sahiplik belirsizken ilk adım?", whyThisQuestionFits: "Sahiplik" },
        { question: "Metrik yoksa hangi kanıt?", whyThisQuestionFits: "Eksik ölçüm" },
        { question: "Koçluk vs hands-on dengesi?", whyThisQuestionFits: "Kapsam" },
      ],
      closingPrep: {
        fixedQuestion: FIXED_CLOSING_QUESTION,
        guestReflectionPrompts: ["Tek cümlelik kanıt", "Dinleyene bırakacağın iz"],
      },
      overallMissingInformation: ["Ölçülebilir sonuç"],
    },
  };
}

describe("arayanlar producer-notes schema", () => {
  it("validates the new preparation contract", () => {
    const parsed = arayanlarPrepareOutputSchema.safeParse(samplePrep());
    expect(parsed.success).toBe(true);
  });

  it("rejects cold open / timeline / checklist shaped legacy as v1", () => {
    const legacyish = {
      recordingWhatToExpect: "x",
      selectedStoryTopic: "y",
      preparationGuidance: ["a"],
      confirmedTargetRole: "QA",
      contactPreferences: "m",
      recordingChecklist: ["mic"],
      coldOpenNote: "cold",
      timelineOverview: "00-18",
      disclaimer: "d",
    };
    expect(arayanlarPrepareOutputSchema.safeParse(legacyish).success).toBe(false);
    const guest = parseStoredGuestArtifact(legacyish);
    expect(guest?.kind).toBe("legacy");
    expect(guest?.view.recordingFormatNote).not.toMatch(/mic|checklist/i);
  });

  it("requires grounded story candidates and allows missing information", () => {
    const prep = samplePrep().preparation;
    expect(prep.storyCandidates.every((s) => s.sourceReferences.length >= 1)).toBe(true);
    expect(prep.storyCandidates.every((s) => s.knownFacts.length >= 1)).toBe(true);
    expect(prep.identityPrep.missingInformation.length).toBeGreaterThan(0);
  });

  it("has exactly one thinking scenario without a model answer field", () => {
    const prep = samplePrep().preparation;
    expect(prep.thinkingScenario.scenario.length).toBeGreaterThan(0);
    expect(JSON.stringify(prep.thinkingScenario)).not.toMatch(/\"answer\"|\"solution\"|\"doğru cevap\"/i);
  });

  it("uses the fixed closing question and 5–8 rapidFire", () => {
    const prep = samplePrep().preparation;
    expect(prep.closingPrep.fixedQuestion).toBe(FIXED_CLOSING_QUESTION);
    expect(prep.rapidFire.length).toBeGreaterThanOrEqual(5);
    expect(prep.rapidFire.length).toBeLessThanOrEqual(8);
  });

  it("separates job search known / inferred / missing", () => {
    const prep = samplePrep().preparation;
    expect(prep.jobSearchPrep.knownPreferences).toContain("hibrit");
    expect(Array.isArray(prep.jobSearchPrep.inferredButUnconfirmed)).toBe(true);
    expect(prep.jobSearchPrep.missingInformation.length).toBeGreaterThan(0);
  });

  it("derives guest and host from the same generation", () => {
    const sample = samplePrep();
    const prep = sample.preparation;
    const guest = toGuestPrepView(prep);
    const host = toHostPrepView(prep);
    expect(guest.storyCandidates[0]?.title).toBe(host.storyCandidates[0]?.title);
    expect(guest.closing.fixedQuestion).toBe(host.closingPrep.fixedQuestion);
    expect(guest.rapidFireQuestions).toHaveLength(host.rapidFire.length);
    expect(JSON.stringify(guest)).not.toMatch(/coldOpen|timelineOverview|recordingChecklist/);
    expect(JSON.stringify(host)).not.toMatch(/coldOpen|timingAndTransitions|equipment/);
  });

  it("keeps older persisted preparation readable", () => {
    const legacyHost = {
      factualIntroduction: {
        text: "Ada QA",
        sourceLabels: ["member_confirmed"],
        uncertaintyLabels: [],
      },
      mainQuestions: [
        { question: "q1", followUps: [] },
        { question: "q2", followUps: [] },
        { question: "q3", followUps: [] },
      ],
      case: {
        title: "c",
        setup: "s",
        supportingFacts: ["a", "b"],
        newFact: "n",
      },
      rapidRound: {
        questions: ["1", "2", "3", "4", "5"],
        alternatives: ["a1", "a2"],
      },
      timingAndTransitions: [{ start: "00:00", end: "00:20", label: "x", hostNote: "n" }],
      unresolvedDetails: ["u"],
      excludedTopics: [],
      approvedContactChannel: "p",
      coldOpenProductionNote: "cold",
      editorialNotes: [],
    };
    const parsed = parseStoredHostArtifact(legacyHost);
    expect(parsed?.kind).toBe("legacy");
    expect(parsed?.view.closingPrep.fixedQuestion).toBe(FIXED_CLOSING_QUESTION);
  });

  it("normalize fills fixed closing and schema version", () => {
    const normalized = normalizeArayanlarOutput(
      {
        preparation: {
          identityPrep: {},
          storyCandidates: [],
          thinkingScenario: {},
          jobSearchPrep: {},
          rapidFire: [],
          closingPrep: {},
          overallMissingInformation: [],
        },
      },
      facts,
    );
    const parsed = arayanlarPrepareOutputSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.preparation.closingPrep.fixedQuestion).toBe(FIXED_CLOSING_QUESTION);
    expect(parsed.data.preparation.rapidFire.length).toBeGreaterThanOrEqual(5);
  });

  it("model config uses ARAYANLAR_PREP_MODEL with gpt-5.6-sol fallback", () => {
    const prev = process.env.ARAYANLAR_PREP_MODEL;
    delete process.env.ARAYANLAR_PREP_MODEL;
    expect(resolveArayanlarPrepModel()).toBe(ARAYANLAR_PREP_MODEL_DEFAULT);
    expect(ARAYANLAR_PREP_MODEL_DEFAULT).toBe("gpt-5.6-sol");
    process.env.ARAYANLAR_PREP_MODEL = "gpt-custom";
    expect(resolveArayanlarPrepModel()).toBe("gpt-custom");
    if (prev === undefined) delete process.env.ARAYANLAR_PREP_MODEL;
    else process.env.ARAYANLAR_PREP_MODEL = prev;
  });
});
