/**
 * Live Kariyer Portresi producer-notes verification.
 * Prints structure only — no API keys, no raw CV.
 */
import { loadAppEnvironment } from "../src/lib/env/load-app-env";

loadAppEnvironment();

async function main() {
  const { resolveArayanlarPrepModel, ARAYANLAR_PREP_REASONING_EFFORT } = await import(
    "../src/lib/arayanlar/prep-model"
  );
  const { generateArayanlarPreparation } = await import("../src/lib/arayanlar/provider");
  const { EDITORIAL_TEMPLATE_VERSION } = await import("../src/lib/arayanlar/constants");
  const { resolveProviderConfig } = await import("../src/lib/ai/provider");
  const { FIXED_CLOSING_QUESTION, toGuestPrepView, toHostPrepView } = await import(
    "../src/lib/arayanlar/artifact-schema"
  );
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { readCvExtractedText } = await import("../src/lib/cv/service");

  const provider = resolveProviderConfig();
  const model = resolveArayanlarPrepModel();
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const email = process.argv[2] ?? "tunc@catchylabs.tech";
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error("USER_NOT_FOUND");

  const app = await db.arayanlarApplication.findUnique({
    where: { userId: user.id },
    select: { submittedFacts: true, submittedRevision: true, prepStatus: true },
  });
  const cv = await db.cvDocument.findFirst({
    where: { userId: user.id, deletedAt: null, extractionStatus: "OK" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const cvText = cv ? await readCvExtractedText(cv.id, user.id) : null;
  const profile = await db.profile.findUnique({
    where: { userId: user.id },
    select: { headline: true, bio: true, skills: true },
  });

  const facts =
    app?.submittedFacts && typeof app.submittedFacts === "object"
      ? (app.submittedFacts as {
          displayName: string;
          targetRole: string;
          storyTopic: string;
          contribution: string;
          workPreferences: string;
          excludedTopics: string;
          contactChannel: string;
          profileHintsUsed: string[];
        })
      : null;
  if (!facts) throw new Error("NO_SUBMITTED_FACTS");

  console.log(
    JSON.stringify({
      phase: "config",
      providerMode: provider.mode,
      model,
      reasoningEffort: ARAYANLAR_PREP_REASONING_EFFORT,
      cvChars: cvText?.length ?? 0,
      factsFieldChars: {
        targetRole: facts.targetRole.length,
        storyTopic: facts.storyTopic.length,
        contribution: facts.contribution.length,
      },
    }),
  );

  const result = await generateArayanlarPreparation({
    facts,
    editorialTemplateVersion: EDITORIAL_TEMPLATE_VERSION,
    cvText,
    profileHints: profile,
  });

  if (!result.ok) {
    console.log(JSON.stringify({ phase: "result", ok: false, code: result.code, mode: result.mode }));
    await db.$disconnect();
    process.exitCode = 1;
    return;
  }

  const prep = result.output.preparation;
  const blob = JSON.stringify(result.output).toLowerCase();
  const guest = toGuestPrepView(prep);
  const host = toHostPrepView(prep);

  console.log(
    JSON.stringify({
      phase: "result",
      ok: true,
      providerMode: result.mode,
      model,
      schemaVersion: result.output.schemaVersion,
      checks: {
        profileSignals: prep.identityPrep.profileSignals.length,
        storyCandidates: prep.storyCandidates.length,
        storiesHaveSources: prep.storyCandidates.every((s) => s.sourceReferences.length > 0),
        missingInfoCount: prep.overallMissingInformation.length + prep.identityPrep.missingInformation.length,
        thinkingScenarioOne: Boolean(prep.thinkingScenario.scenario),
        rapidFire: prep.rapidFire.length,
        fixedClosing: prep.closingPrep.fixedQuestion === FIXED_CLOSING_QUESTION,
        noColdOpen: !blob.includes("coldopen") && !blob.includes("cold_open"),
        noTimeline: !blob.includes("timelineoverview") && !blob.includes("timingandtransitions"),
        noChecklist: !blob.includes("recordingchecklist") && !blob.includes("mikrofon"),
        noEquipmentAdvice: !/(mikrofon|ortamını hazırla|kayıt alanını kontrol)/i.test(blob),
        guestHostSameStories:
          guest.storyCandidates[0]?.title === host.storyCandidates[0]?.title,
      },
      sampleSignals: prep.identityPrep.profileSignals.slice(0, 3).map((s) => s.slice(0, 80)),
      sampleStoryTitles: prep.storyCandidates.map((s) => s.title.slice(0, 60)),
      sampleMissing: prep.identityPrep.missingInformation.slice(0, 3).map((s) => s.slice(0, 80)),
      thinkingWhy: prep.thinkingScenario.whyItFitsThisCandidate.slice(0, 120),
    }),
  );

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
