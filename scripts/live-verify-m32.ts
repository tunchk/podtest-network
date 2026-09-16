/**
 * M3.2 API/integration verification with synthetic users.
 * Does not send real emails or invitations externally.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createDefaultProfileForUser } from "../src/lib/profiles/service";
import {
  createQuestionDraft,
  submitQuestion,
  getPublicQuestion,
} from "../src/lib/community/questions";
import { createAnswerDraft, submitAnswer } from "../src/lib/community/answers";
import { createContentReport } from "../src/lib/messaging/reports";
import { createSpeakerInvitation, acceptSpeakerInvitation } from "../src/lib/community/invitations";
import {
  createExpertFaqDraft,
  expertApproveFaqRevision,
  listPublishedFaqsForExpert,
} from "../src/lib/community/expert-faq";
import {
  createPodcastEpisode,
  requestAppearance,
  adminVerifyAppearance,
  listPublicAppearancesForMember,
} from "../src/lib/community/episodes";
import { requestEmailVerification, confirmEmailVerification } from "../src/lib/auth/email-verification";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `live32-${Date.now().toString(36)}`;

async function main() {
  const asker = await db.user.create({
    data: {
      name: "M32 Asker",
      email: `m32-asker-${suffix}@example.com`,
      emailVerified: false,
      staffRole: "MEMBER",
    },
  });
  const answerer = await db.user.create({
    data: {
      name: "M32 Answerer",
      email: `m32-answerer-${suffix}@example.com`,
      emailVerified: false,
      staffRole: "MEMBER",
    },
  });
  const speaker = await db.user.create({
    data: {
      name: "M32 Speaker",
      email: `m32-speaker-${suffix}@example.com`,
      emailVerified: false,
      staffRole: "MEMBER",
    },
  });
  const admin = await db.user.findFirst({ where: { staffRole: "ADMIN" } });
  if (!admin) throw new Error("Need an ADMIN user (npm run bootstrap:admin)");

  for (const u of [asker, answerer, speaker]) {
    await createDefaultProfileForUser(u);
  }

  const q = await createQuestionDraft({
    authorId: asker.id,
    title: `Canlı doğrulama sorusu ${suffix}`,
    body: "Profil yayını olmadan soru.",
  });
  await submitQuestion({
    authorId: asker.id,
    questionId: q.id,
    idempotencyKey: `live-q-${suffix}`,
  });
  const a = await createAnswerDraft({
    authorId: answerer.id,
    questionId: q.id,
    body: "Canlı doğrulama cevabı.",
  });
  await submitAnswer({
    authorId: answerer.id,
    answerId: a.id,
    idempotencyKey: `live-a-${suffix}`,
  });
  await createContentReport({
    reporterId: answerer.id,
    targetType: "COMMUNITY_QUESTION",
    targetId: q.id,
    reasonCode: "other",
    explanation: "live verify",
  });

  const verify = await requestEmailVerification(speaker.id);
  if (verify.alreadyVerified) throw new Error("unexpected verified");
  await confirmEmailVerification({
    userId: speaker.id,
    token: verify.plaintextTokenForOwner,
  });

  const inv = await createSpeakerInvitation({
    adminId: admin.id,
    recipientEmail: speaker.email,
    purpose: "SPEAKER_STATUS",
  });
  await acceptSpeakerInvitation({ userId: speaker.id, token: inv.plaintextToken });

  const faq = await createExpertFaqDraft({
    expertUserId: speaker.id,
    question: "Örnek SSS?",
    answer: "Uzman onaylı yanıt.",
  });
  await expertApproveFaqRevision({
    expertUserId: speaker.id,
    faqId: faq.id,
    revision: faq.currentRevision,
  });
  const faqs = await listPublishedFaqsForExpert(speaker.id);
  if (!faqs.length) throw new Error("FAQ not published");

  const ep = await createPodcastEpisode({
    adminId: admin.id,
    series: "PodTest",
    title: `Doğrulama bölümü ${suffix}`,
    listeningUrl: "https://example.com/podtest-ep",
    publicationState: "PUBLISHED",
    publicationDate: new Date(),
  });
  const appearance = await requestAppearance({
    memberUserId: speaker.id,
    episodeId: ep.id,
  });
  await adminVerifyAppearance({ adminId: admin.id, appearanceId: appearance.id });

  await db.profile.update({
    where: { userId: speaker.id },
    data: {
      published: true,
      publicationStatus: "APPROVED",
      showAppearancesOnProfile: true,
      publicSnapshot: {
        displayName: "M32 Speaker",
        slug: `m32-speaker-${suffix}`,
        headline: null,
        bio: null,
        skills: [],
        interests: [],
        experience: null,
        education: null,
        projects: null,
        languages: null,
        location: null,
        workPreferences: null,
        publicLinks: [],
        openToWork: false,
        hiring: false,
        openToProjects: false,
        discoverable: true,
      },
      slug: `m32-speaker-${suffix}`,
      displayName: "M32 Speaker",
    },
  });

  const apps = await listPublicAppearancesForMember(speaker.id);
  const pub = await getPublicQuestion(q.id);

  console.log(
    JSON.stringify(
      {
        ok: true,
        questionId: q.id,
        questionPublic: Boolean(pub),
        answers: pub?.answers.length ?? 0,
        speakerSlug: `m32-speaker-${suffix}`,
        faqCount: faqs.length,
        appearanceCount: apps.length,
        inviteAcceptPath: inv.acceptPath,
        note: "No real email sent. Tokens hashed.",
      },
      null,
      2,
    ),
  );

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

// Fixture emails from this script are registered in scripts/cleanup-verify-fixtures.ts
