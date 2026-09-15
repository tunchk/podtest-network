import { z } from "zod";

const sourceLabel = z.enum([
  "member_confirmed",
  "approved_profile",
  "inferred_soft",
  "unresolved",
]);

export const guestBriefSchema = z.object({
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

export const hostPackSchema = z.object({
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

export const arayanlarPrepareOutputSchema = z.object({
  guestBrief: guestBriefSchema,
  hostPack: hostPackSchema,
});

export type GuestBrief = z.infer<typeof guestBriefSchema>;
export type HostPack = z.infer<typeof hostPackSchema>;
export type ArayanlarPrepareOutput = z.infer<typeof arayanlarPrepareOutputSchema>;

export const ARAYANLAR_PREPARE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["guestBrief", "hostPack"],
  properties: {
    guestBrief: {
      type: "object",
      additionalProperties: false,
      required: [
        "recordingWhatToExpect",
        "selectedStoryTopic",
        "preparationGuidance",
        "confirmedTargetRole",
        "contactPreferences",
        "recordingChecklist",
        "coldOpenNote",
        "timelineOverview",
        "disclaimer",
      ],
      properties: {
        recordingWhatToExpect: { type: "string" },
        selectedStoryTopic: { type: "string" },
        preparationGuidance: { type: "array", items: { type: "string" } },
        confirmedTargetRole: { type: "string" },
        contactPreferences: { type: "string" },
        recordingChecklist: { type: "array", items: { type: "string" } },
        coldOpenNote: { type: "string" },
        timelineOverview: { type: "string" },
        disclaimer: { type: "string" },
      },
    },
    hostPack: {
      type: "object",
      additionalProperties: false,
      required: [
        "factualIntroduction",
        "mainQuestions",
        "case",
        "rapidRound",
        "timingAndTransitions",
        "unresolvedDetails",
        "excludedTopics",
        "approvedContactChannel",
        "coldOpenProductionNote",
        "editorialNotes",
      ],
      properties: {
        factualIntroduction: {
          type: "object",
          additionalProperties: false,
          required: ["text", "sourceLabels", "uncertaintyLabels"],
          properties: {
            text: { type: "string" },
            sourceLabels: { type: "array", items: { type: "string" } },
            uncertaintyLabels: { type: "array", items: { type: "string" } },
          },
        },
        mainQuestions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["question", "followUps"],
            properties: {
              question: { type: "string" },
              followUps: { type: "array", items: { type: "string" } },
            },
          },
        },
        case: {
          type: "object",
          additionalProperties: false,
          required: ["title", "setup", "supportingFacts", "newFact"],
          properties: {
            title: { type: "string" },
            setup: { type: "string" },
            supportingFacts: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 2,
            },
            newFact: { type: "string" },
          },
        },
        rapidRound: {
          type: "object",
          additionalProperties: false,
          required: ["questions", "alternatives"],
          properties: {
            questions: {
              type: "array",
              items: { type: "string" },
              minItems: 5,
              maxItems: 5,
            },
            alternatives: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 2,
            },
          },
        },
        timingAndTransitions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["start", "end", "label", "hostNote"],
            properties: {
              start: { type: "string" },
              end: { type: "string" },
              label: { type: "string" },
              hostNote: { type: "string" },
            },
          },
        },
        unresolvedDetails: { type: "array", items: { type: "string" } },
        excludedTopics: { type: "array", items: { type: "string" } },
        approvedContactChannel: { type: "string" },
        coldOpenProductionNote: { type: "string" },
        editorialNotes: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

// silence unused for optional future labeling helpers
void sourceLabel;
