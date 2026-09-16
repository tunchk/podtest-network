import { z } from "zod";

/** Fixed product closing question — not model-invented. */
export const FIXED_CLOSING_QUESTION =
  "Seni dinleyen ve “bu kişiyle konuşmalıyım” diyen birine ne söylemek istersin?";

export const PREPARATION_SCHEMA_VERSION = "producer-notes-v1" as const;

const nonEmptyString = z.string().min(1);
const stringList = z.array(nonEmptyString);

export const storyCandidateSchema = z.object({
  title: nonEmptyString,
  sourceExperience: nonEmptyString,
  whyThisCouldBeAStory: nonEmptyString,
  knownFacts: stringList.min(1).max(12),
  missingDetails: stringList.max(12),
  guestPrepQuestions: stringList.min(1).max(8),
  hostQuestions: stringList.min(1).max(8),
  followUpQuestions: stringList.max(8),
  sourceReferences: stringList.min(1).max(8),
});

export const arayanlarPreparationSchema = z.object({
  identityPrep: z.object({
    profileSignals: stringList.min(3).max(6),
    careerThemes: stringList.min(1).max(8),
    careerTransitions: stringList.max(8),
    confirmedFacts: stringList.min(1).max(12),
    missingInformation: stringList.max(12),
    guestPrepQuestions: stringList.min(1).max(8),
    hostQuestions: stringList.min(1).max(8),
  }),
  storyCandidates: z.array(storyCandidateSchema).min(1).max(3),
  thinkingScenario: z.object({
    scenario: nonEmptyString,
    whyItFitsThisCandidate: nonEmptyString,
    whatTheHostShouldListenFor: stringList.min(2).max(10),
    constraints: stringList.min(1).max(8),
  }),
  jobSearchPrep: z.object({
    knownPreferences: stringList.max(12),
    inferredButUnconfirmed: stringList.max(12),
    missingInformation: stringList.max(12),
    guestPrepQuestions: stringList.min(1).max(8),
    hostQuestions: stringList.min(1).max(8),
  }),
  rapidFire: z
    .array(
      z.object({
        question: nonEmptyString,
        whyThisQuestionFits: nonEmptyString,
      }),
    )
    .min(5)
    .max(8),
  closingPrep: z.object({
    fixedQuestion: z.literal(FIXED_CLOSING_QUESTION),
    guestReflectionPrompts: stringList.min(2).max(4),
  }),
  overallMissingInformation: stringList.max(20),
});

export type ArayanlarPreparation = z.infer<typeof arayanlarPreparationSchema>;
export type StoryCandidate = z.infer<typeof storyCandidateSchema>;

/** Canonical AI + persisted artifact payload (v1). */
export const arayanlarPrepareOutputSchema = z.object({
  schemaVersion: z.literal(PREPARATION_SCHEMA_VERSION),
  preparation: arayanlarPreparationSchema,
});

export type ArayanlarPrepareOutput = z.infer<typeof arayanlarPrepareOutputSchema>;

/** Guest-facing derived view (no raw CV). */
export type GuestPrepView = {
  schemaVersion: typeof PREPARATION_SCHEMA_VERSION;
  identitySignals: string[];
  careerThemes: string[];
  storyCandidates: Array<{
    title: string;
    sourceExperience: string;
    whyPrepare: string;
    knownFacts: string[];
    missingDetails: string[];
    prepQuestions: string[];
  }>;
  thinkingScenarioHint: string;
  jobSearch: {
    knownPreferences: string[];
    missingInformation: string[];
    prepQuestions: string[];
  };
  rapidFireQuestions: string[];
  closing: {
    fixedQuestion: string;
    reflectionPrompts: string[];
  };
  overallMissingInformation: string[];
  recordingFormatNote: string;
};

/** Host-facing derived view (producer notes; no raw CV). */
export type HostPrepView = {
  schemaVersion: typeof PREPARATION_SCHEMA_VERSION;
  identityPrep: ArayanlarPreparation["identityPrep"];
  storyCandidates: ArayanlarPreparation["storyCandidates"];
  thinkingScenario: ArayanlarPreparation["thinkingScenario"];
  jobSearchPrep: ArayanlarPreparation["jobSearchPrep"];
  rapidFire: ArayanlarPreparation["rapidFire"];
  closingPrep: ArayanlarPreparation["closingPrep"];
  overallMissingInformation: string[];
  recordingFormat: string[];
};

export const RECORDING_FORMAT_STEPS = [
  "Sen kimsin?",
  "Bana bir hikâye anlat",
  "Masaya bir problem koyuyorum",
  "Ben ne arıyorum?",
  "Hızlı tur",
  "Kapanış",
] as const;

export function toGuestPrepView(preparation: ArayanlarPreparation): GuestPrepView {
  return {
    schemaVersion: PREPARATION_SCHEMA_VERSION,
    identitySignals: preparation.identityPrep.profileSignals,
    careerThemes: preparation.identityPrep.careerThemes,
    storyCandidates: preparation.storyCandidates.map((s) => ({
      title: s.title,
      sourceExperience: s.sourceExperience,
      whyPrepare: s.whyThisCouldBeAStory,
      knownFacts: s.knownFacts,
      missingDetails: s.missingDetails,
      prepQuestions: s.guestPrepQuestions,
    })),
    thinkingScenarioHint:
      "Kayıtta host kısa bir düşünme senaryosu soracak. Cevabı ezberleme; senaryoyu önceden bilmen beklenmez. Eksik bildiğin detayları şimdiden netleştirmek yeterli.",
    jobSearch: {
      knownPreferences: preparation.jobSearchPrep.knownPreferences,
      missingInformation: preparation.jobSearchPrep.missingInformation,
      prepQuestions: preparation.jobSearchPrep.guestPrepQuestions,
    },
    rapidFireQuestions: preparation.rapidFire.map((r) => r.question),
    closing: {
      fixedQuestion: preparation.closingPrep.fixedQuestion,
      reflectionPrompts: preparation.closingPrep.guestReflectionPrompts,
    },
    overallMissingInformation: preparation.overallMissingInformation,
    recordingFormatNote: `Kayıt formatı sabittir: ${RECORDING_FORMAT_STEPS.join(" → ")}. Soğuk açılış kayıt sonrası seçilir; ekipman/ortam tavsiyesi bu notların parçası değildir.`,
  };
}

export function toHostPrepView(preparation: ArayanlarPreparation): HostPrepView {
  return {
    schemaVersion: PREPARATION_SCHEMA_VERSION,
    identityPrep: preparation.identityPrep,
    storyCandidates: preparation.storyCandidates,
    thinkingScenario: preparation.thinkingScenario,
    jobSearchPrep: preparation.jobSearchPrep,
    rapidFire: preparation.rapidFire,
    closingPrep: preparation.closingPrep,
    overallMissingInformation: preparation.overallMissingInformation,
    recordingFormat: [...RECORDING_FORMAT_STEPS],
  };
}

/** Alias used by host editor / call sites after redesign. */
export type HostPack = HostPrepView;
export type GuestBrief = GuestPrepView;

// --- Legacy schemas (read-only compatibility) ---

export const legacyGuestBriefSchema = z.object({
  recordingWhatToExpect: z.string().min(1),
  selectedStoryTopic: z.string().min(1),
  preparationGuidance: z.array(z.string()).min(1).max(8),
  confirmedTargetRole: z.string().min(1),
  contactPreferences: z.string().min(1),
  recordingChecklist: z.array(z.string()).min(1).max(12),
  coldOpenNote: z.string().min(1),
  timelineOverview: z.string().min(1),
  disclaimer: z.string().min(1),
});

export const legacyHostPackSchema = z.object({
  factualIntroduction: z.object({
    text: z.string().min(1),
    sourceLabels: z.array(z.string()).min(1),
    uncertaintyLabels: z.array(z.string()),
  }),
  mainQuestions: z
    .array(
      z.object({
        question: z.string().min(1),
        followUps: z.array(z.string()).max(3).default([]),
      }),
    )
    .min(3)
    .max(8),
  case: z.object({
    title: z.string().min(1),
    setup: z.string().min(1),
    supportingFacts: z.array(z.string().min(1)).length(2),
    newFact: z.string().min(1),
  }),
  rapidRound: z.object({
    questions: z.array(z.string().min(1)).length(5),
    alternatives: z.array(z.string().min(1)).length(2),
  }),
  timingAndTransitions: z
    .array(
      z.object({
        start: z.string(),
        end: z.string(),
        label: z.string(),
        hostNote: z.string(),
      }),
    )
    .min(1),
  unresolvedDetails: z.array(z.string()),
  excludedTopics: z.array(z.string()),
  approvedContactChannel: z.string().min(1),
  coldOpenProductionNote: z.string().min(1),
  editorialNotes: z.array(z.string()),
});

export type LegacyGuestBrief = z.infer<typeof legacyGuestBriefSchema>;
export type LegacyHostPack = z.infer<typeof legacyHostPackSchema>;

function legacyGuestToCompatView(legacy: LegacyGuestBrief): GuestPrepView {
  return {
    schemaVersion: PREPARATION_SCHEMA_VERSION,
    identitySignals: [legacy.confirmedTargetRole].filter(Boolean),
    careerThemes: [],
    storyCandidates: [
      {
        title: legacy.selectedStoryTopic,
        sourceExperience: "Önceki hazırlık kaydı",
        whyPrepare: "Önceki şemadan taşınan konu notu.",
        knownFacts: [legacy.selectedStoryTopic],
        missingDetails: [
          "Bu kayıt eski formatta; yeni kanıt-temelli notlar için yeniden üretim gerekir.",
        ],
        prepQuestions: legacy.preparationGuidance.slice(0, 4),
      },
    ],
    thinkingScenarioHint:
      "Bu hazırlık eski formattadır. Yeni düşünme senaryosu için hazırlığın yeniden üretilmesi gerekir.",
    jobSearch: {
      knownPreferences: [legacy.contactPreferences].filter(Boolean),
      missingInformation: ["Eski format — iş arama tercihleri ayrıştırılmamış."],
      prepQuestions: [],
    },
    rapidFireQuestions: [],
    closing: {
      fixedQuestion: FIXED_CLOSING_QUESTION,
      reflectionPrompts: ["Kendi sözlerinle kısa bir kapanış düşün."],
    },
    overallMissingInformation: [
      "Eski hazırlık formatı: cold open / timeline / checklist alanları artık kullanılmıyor.",
    ],
    recordingFormatNote: `Kayıt formatı sabittir: ${RECORDING_FORMAT_STEPS.join(" → ")}. (Eski kayıt — soğuk açılış/timeline üretilmiş olabilir; yeni üretimde yoktur.)`,
  };
}

function legacyHostToCompatView(legacy: LegacyHostPack): HostPrepView {
  return {
    schemaVersion: PREPARATION_SCHEMA_VERSION,
    identityPrep: {
      profileSignals: [legacy.factualIntroduction.text.slice(0, 180)],
      careerThemes: [],
      careerTransitions: [],
      confirmedFacts: legacy.case.supportingFacts,
      missingInformation: legacy.unresolvedDetails,
      guestPrepQuestions: [],
      hostQuestions: legacy.mainQuestions.map((q) => q.question),
    },
    storyCandidates: [
      {
        title: legacy.case.title,
        sourceExperience: "Önceki host paketi",
        whyThisCouldBeAStory: legacy.case.setup,
        knownFacts: legacy.case.supportingFacts,
        missingDetails: legacy.unresolvedDetails.slice(0, 4),
        guestPrepQuestions: [],
        hostQuestions: legacy.mainQuestions.map((q) => q.question).slice(0, 4),
        followUpQuestions: legacy.mainQuestions.flatMap((q) => q.followUps).slice(0, 4),
        sourceReferences: legacy.factualIntroduction.sourceLabels,
      },
    ],
    thinkingScenario: {
      scenario: legacy.case.setup,
      whyItFitsThisCandidate: "Eski vaka alanından taşındı; yeniden üretim önerilir.",
      whatTheHostShouldListenFor: ["Netleştirme soruları", "Risk önceliklendirme"],
      constraints: [legacy.case.newFact],
    },
    jobSearchPrep: {
      knownPreferences: [],
      inferredButUnconfirmed: [],
      missingInformation: legacy.unresolvedDetails,
      guestPrepQuestions: [],
      hostQuestions: [],
    },
    rapidFire: legacy.rapidRound.questions.map((question) => ({
      question,
      whyThisQuestionFits: "Eski hızlı tur sorusu (yeniden üretim önerilir).",
    })),
    closingPrep: {
      fixedQuestion: FIXED_CLOSING_QUESTION,
      guestReflectionPrompts: ["Kısa ve öz bir kapanış düşün."],
    },
    overallMissingInformation: [
      ...legacy.unresolvedDetails,
      "Eski host paketi formatı — cold open / timeline alanları yeni üründe yok.",
    ],
    recordingFormat: [...RECORDING_FORMAT_STEPS],
  };
}

export function parseStoredGuestArtifact(value: unknown): {
  kind: "v1" | "legacy";
  view: GuestPrepView;
  preparation?: ArayanlarPreparation;
  legacy?: LegacyGuestBrief;
} | null {
  const v1 = arayanlarPrepareOutputSchema.safeParse(value);
  if (v1.success) {
    return {
      kind: "v1",
      view: toGuestPrepView(v1.data.preparation),
      preparation: v1.data.preparation,
    };
  }
  const legacy = legacyGuestBriefSchema.safeParse(value);
  if (legacy.success) {
    return {
      kind: "legacy",
      view: legacyGuestToCompatView(legacy.data),
      legacy: legacy.data,
    };
  }
  return null;
}

export function parseStoredHostArtifact(value: unknown): {
  kind: "v1" | "legacy";
  view: HostPrepView;
  preparation?: ArayanlarPreparation;
  legacy?: LegacyHostPack;
} | null {
  const v1 = arayanlarPrepareOutputSchema.safeParse(value);
  if (v1.success) {
    return {
      kind: "v1",
      view: toHostPrepView(v1.data.preparation),
      preparation: v1.data.preparation,
    };
  }
  const legacy = legacyHostPackSchema.safeParse(value);
  if (legacy.success) {
    return {
      kind: "legacy",
      view: legacyHostToCompatView(legacy.data),
      legacy: legacy.data,
    };
  }
  return null;
}

/** OpenAI strict JSON schema for producer notes. */
export const ARAYANLAR_PREPARE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "preparation"],
  properties: {
    schemaVersion: { type: "string", enum: [PREPARATION_SCHEMA_VERSION] },
    preparation: {
      type: "object",
      additionalProperties: false,
      required: [
        "identityPrep",
        "storyCandidates",
        "thinkingScenario",
        "jobSearchPrep",
        "rapidFire",
        "closingPrep",
        "overallMissingInformation",
      ],
      properties: {
        identityPrep: {
          type: "object",
          additionalProperties: false,
          required: [
            "profileSignals",
            "careerThemes",
            "careerTransitions",
            "confirmedFacts",
            "missingInformation",
            "guestPrepQuestions",
            "hostQuestions",
          ],
          properties: {
            profileSignals: { type: "array", items: { type: "string" } },
            careerThemes: { type: "array", items: { type: "string" } },
            careerTransitions: { type: "array", items: { type: "string" } },
            confirmedFacts: { type: "array", items: { type: "string" } },
            missingInformation: { type: "array", items: { type: "string" } },
            guestPrepQuestions: { type: "array", items: { type: "string" } },
            hostQuestions: { type: "array", items: { type: "string" } },
          },
        },
        storyCandidates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "title",
              "sourceExperience",
              "whyThisCouldBeAStory",
              "knownFacts",
              "missingDetails",
              "guestPrepQuestions",
              "hostQuestions",
              "followUpQuestions",
              "sourceReferences",
            ],
            properties: {
              title: { type: "string" },
              sourceExperience: { type: "string" },
              whyThisCouldBeAStory: { type: "string" },
              knownFacts: { type: "array", items: { type: "string" } },
              missingDetails: { type: "array", items: { type: "string" } },
              guestPrepQuestions: { type: "array", items: { type: "string" } },
              hostQuestions: { type: "array", items: { type: "string" } },
              followUpQuestions: { type: "array", items: { type: "string" } },
              sourceReferences: { type: "array", items: { type: "string" } },
            },
          },
        },
        thinkingScenario: {
          type: "object",
          additionalProperties: false,
          required: [
            "scenario",
            "whyItFitsThisCandidate",
            "whatTheHostShouldListenFor",
            "constraints",
          ],
          properties: {
            scenario: { type: "string" },
            whyItFitsThisCandidate: { type: "string" },
            whatTheHostShouldListenFor: { type: "array", items: { type: "string" } },
            constraints: { type: "array", items: { type: "string" } },
          },
        },
        jobSearchPrep: {
          type: "object",
          additionalProperties: false,
          required: [
            "knownPreferences",
            "inferredButUnconfirmed",
            "missingInformation",
            "guestPrepQuestions",
            "hostQuestions",
          ],
          properties: {
            knownPreferences: { type: "array", items: { type: "string" } },
            inferredButUnconfirmed: { type: "array", items: { type: "string" } },
            missingInformation: { type: "array", items: { type: "string" } },
            guestPrepQuestions: { type: "array", items: { type: "string" } },
            hostQuestions: { type: "array", items: { type: "string" } },
          },
        },
        rapidFire: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["question", "whyThisQuestionFits"],
            properties: {
              question: { type: "string" },
              whyThisQuestionFits: { type: "string" },
            },
          },
        },
        closingPrep: {
          type: "object",
          additionalProperties: false,
          required: ["fixedQuestion", "guestReflectionPrompts"],
          properties: {
            fixedQuestion: { type: "string", enum: [FIXED_CLOSING_QUESTION] },
            guestReflectionPrompts: { type: "array", items: { type: "string" } },
          },
        },
        overallMissingInformation: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;
