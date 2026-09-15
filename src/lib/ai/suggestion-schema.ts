import { z } from "zod";

/** Structured profile suggestions — Turkish member-facing values only. */
export const profileSuggestionSchema = z.object({
  fields: z.object({
    displayName: z
      .object({
        value: z.string().nullable(),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
    headline: z
      .object({
        value: z.string().nullable(),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
    bio: z
      .object({
        value: z.string().nullable(),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
    skills: z
      .object({
        value: z.array(z.string()),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
    interests: z
      .object({
        value: z.array(z.string()),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
    experience: z
      .object({
        value: z.string().nullable(),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
    education: z
      .object({
        value: z.string().nullable(),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
    projects: z
      .object({
        value: z.string().nullable(),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
    languages: z
      .object({
        value: z.array(z.string()),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
    location: z
      .object({
        value: z.string().nullable(),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
    workPreferences: z
      .object({
        value: z.string().nullable(),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
    publicLinks: z
      .object({
        value: z.array(z.object({ url: z.string() })),
        source: z.enum(["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"]),
        uncertain: z.boolean(),
        note: z.string().nullable(),
      })
      .nullable(),
  }),
  missingOrUncertain: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type ProfileSuggestions = z.infer<typeof profileSuggestionSchema>;

export const PROFILE_SUGGESTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fields", "missingOrUncertain", "warnings"],
  properties: {
    fields: {
      type: "object",
      additionalProperties: false,
      required: [
        "displayName",
        "headline",
        "bio",
        "skills",
        "interests",
        "experience",
        "education",
        "projects",
        "languages",
        "location",
        "workPreferences",
        "publicLinks",
      ],
      properties: Object.fromEntries(
        [
          "displayName",
          "headline",
          "bio",
          "skills",
          "interests",
          "experience",
          "education",
          "projects",
          "languages",
          "location",
          "workPreferences",
          "publicLinks",
        ].map((key) => [
          key,
          {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                required: ["value", "source", "uncertain", "note"],
                properties: {
                  value:
                    key === "skills" || key === "interests" || key === "languages"
                      ? { type: "array", items: { type: "string" } }
                      : key === "publicLinks"
                        ? {
                            type: "array",
                            items: {
                              type: "object",
                              additionalProperties: false,
                              required: ["url"],
                              properties: { url: { type: "string" } },
                            },
                          }
                        : { anyOf: [{ type: "string" }, { type: "null" }] },
                  source: {
                    type: "string",
                    enum: ["cv", "member_confirmed", "inferred_suggestion", "needs_clarification"],
                  },
                  uncertain: { type: "boolean" },
                  note: { anyOf: [{ type: "string" }, { type: "null" }] },
                },
              },
            ],
          },
        ]),
      ),
    },
    missingOrUncertain: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;
