import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDefaultProfileForUser } from "@/lib/profiles/service";
import {
  createQuestionDraft,
  submitQuestion,
  getPublicQuestion,
  listPublishedQuestions,
  removeQuestionByOwner,
} from "@/lib/community/questions";
import { createAnswerDraft, submitAnswer } from "@/lib/community/answers";
import { blockMember } from "@/lib/messaging/blocks";
import {
  createSpeakerInvitation,
  acceptSpeakerInvitation,
  revokeSpeakerInvitation,
} from "@/lib/community/invitations";
import {
  confirmEmailVerification,
  hashOpaqueToken,
  requestEmailVerification,
} from "@/lib/auth/email-verification";
import {
  createExpertFaqDraft,
  editExpertFaq,
  expertApproveFaqRevision,
  listPublishedFaqsForExpert,
} from "@/lib/community/expert-faq";
import {
  createPodcastEpisode,
  requestAppearance,
  adminVerifyAppearance,
  listPublishedEpisodes,
  listPublicAppearancesForMember,
} from "@/lib/community/episodes";
import { createContentReport } from "@/lib/messaging/reports";
import { COMMUNITY_QUESTIONS_PER_DAY } from "@/lib/community/constants";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `m32-${Date.now().toString(36)}`;

async function createUser(label: string, opts?: { verified?: boolean; role?: "MEMBER" | "ADMIN" | "MODERATOR" }) {
  return db.user.create({
    data: {
      name: label,
      email: `${label}-${suffix}@example.com`,
      emailVerified: opts?.verified ?? false,
      staffRole: opts?.role ?? "MEMBER",
    },
  });
}

describe("m3.2 community Q&A / invitations / FAQs / episodes", () => {
  let asker = "";
  let answerer = "";
  let blockedPeer = "";
  let expert = "";
  let admin = "";
  let moderator = "";
  const ids: string[] = [];

  beforeAll(async () => {
    const uAsk = await createUser("m32ask");
    const uAns = await createUser("m32ans");
    const uBlock = await createUser("m32blk");
    const uExp = await createUser("m32exp", { verified: true });
    const uAdmin = await createUser("m32adm", { verified: true, role: "ADMIN" });
    const uMod = await createUser("m32mod", { verified: true, role: "MODERATOR" });
    asker = uAsk.id;
    answerer = uAns.id;
    blockedPeer = uBlock.id;
    expert = uExp.id;
    admin = uAdmin.id;
    moderator = uMod.id;
    ids.push(asker, answerer, blockedPeer, expert, admin, moderator);

    for (const id of ids) {
      const user = await db.user.findUniqueOrThrow({ where: { id } });
      await createDefaultProfileForUser(user);
    }
  });

  afterAll(async () => {
    await db.inAppNotification.deleteMany({ where: { userId: { in: ids } } });
    await db.targetedExpertQuestion.deleteMany({
      where: { OR: [{ askerId: { in: ids } }, { expertUserId: { in: ids } }] },
    });
    await db.episodeAppearance.deleteMany({ where: { memberUserId: { in: ids } } });
    await db.expertFaqRevision.deleteMany({
      where: { faq: { expertUserId: { in: ids } } },
    });
    await db.expertFaq.deleteMany({ where: { expertUserId: { in: ids } } });
    await db.communityAnswerRevision.deleteMany({
      where: { answer: { authorId: { in: ids } } },
    });
    await db.communityAnswer.deleteMany({ where: { authorId: { in: ids } } });
    await db.communityQuestionRevision.deleteMany({
      where: { question: { authorId: { in: ids } } },
    });
    await db.communityQuestion.deleteMany({ where: { authorId: { in: ids } } });
    await db.communityQuotaUse.deleteMany({ where: { userId: { in: ids } } });
    await db.speakerInvitation.deleteMany({
      where: { OR: [{ createdById: { in: ids } }, { consumedById: { in: ids } }] },
    });
    await db.podcastEpisode.deleteMany({ where: { createdById: { in: ids } } });
    await db.emailVerificationToken.deleteMany({ where: { userId: { in: ids } } });
    await db.contentReport.deleteMany({ where: { reporterId: { in: ids } } });
    await db.memberBlock.deleteMany({
      where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] },
    });
    await db.moderationHold.deleteMany({ where: { senderId: { in: ids } } });
    await db.profile.deleteMany({ where: { userId: { in: ids } } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.account.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("member without published profile can ask and another can answer", async () => {
    const draft = await createQuestionDraft({
      authorId: asker,
      title: "Test sorusu başlık",
      body: "Profil yayını olmadan soru sorabilmeliyim.",
      topicTags: ["test"],
    });
    expect(draft.status).toBe("DRAFT");
    expect(await getPublicQuestion(draft.id)).toBeNull();

    const published = await submitQuestion({
      authorId: asker,
      questionId: draft.id,
      idempotencyKey: `q1-${suffix}`,
    });
    expect(published.status).toBe("PUBLISHED");

    const publicQ = await getPublicQuestion(draft.id);
    expect(publicQ?.title).toBe("Test sorusu başlık");
    expect(publicQ?.authorDisplayName).toBeTruthy();

    const ansDraft = await createAnswerDraft({
      authorId: answerer,
      questionId: draft.id,
      body: "Cevap metni burada.",
    });
    const ans = await submitAnswer({
      authorId: answerer,
      answerId: ansDraft.id,
      idempotencyKey: `a1-${suffix}`,
    });
    expect(ans.status).toBe("PUBLISHED");

    const again = await getPublicQuestion(draft.id);
    expect(again?.answers).toHaveLength(1);
  });

  it("removed question hides public answer thread", async () => {
    const draft = await createQuestionDraft({
      authorId: asker,
      title: "Kaldırılacak soru",
      body: "Bu soru sonra kaldırılacak.",
    });
    await submitQuestion({
      authorId: asker,
      questionId: draft.id,
      idempotencyKey: `q-rm-${suffix}`,
    });
    const ansDraft = await createAnswerDraft({
      authorId: answerer,
      questionId: draft.id,
      body: "Görünür cevap",
    });
    await submitAnswer({
      authorId: answerer,
      answerId: ansDraft.id,
      idempotencyKey: `a-rm-${suffix}`,
    });
    await removeQuestionByOwner({ authorId: asker, questionId: draft.id });
    expect(await getPublicQuestion(draft.id)).toBeNull();
    const list = await listPublishedQuestions({ page: 1 });
    expect(list.items.find((i) => i.id === draft.id)).toBeUndefined();
  });

  it("blocked pair cannot answer each other's questions", async () => {
    await blockMember({ blockerId: asker, blockedId: blockedPeer });
    const draft = await createQuestionDraft({
      authorId: asker,
      title: "Engelli çift sorusu",
      body: "Engellenen cevaplayamamalı.",
    });
    await submitQuestion({
      authorId: asker,
      questionId: draft.id,
      idempotencyKey: `q-blk-${suffix}`,
    });
    await expect(
      createAnswerDraft({
        authorId: blockedPeer,
        questionId: draft.id,
        body: "Bypass denemesi",
      }),
    ).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("question daily quota holds under concurrent submits", async () => {
    const quotaUser = await createUser("m32quota");
    ids.push(quotaUser.id);
    await createDefaultProfileForUser(quotaUser);

    const drafts = [];
    for (let i = 0; i < COMMUNITY_QUESTIONS_PER_DAY + 3; i++) {
      drafts.push(
        await createQuestionDraft({
          authorId: quotaUser.id,
          title: `Kota ${i} ${suffix}`,
          body: `Kota gövdesi ${i}`,
        }),
      );
    }
    const results = await Promise.allSettled(
      drafts.map((d, i) =>
        submitQuestion({
          authorId: quotaUser.id,
          questionId: d.id,
          idempotencyKey: `quota-${suffix}-${i}`,
        }),
      ),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter(
      (r) => r.status === "rejected" && (r.reason as { code?: string })?.code === "QUOTA_EXCEEDED",
    ).length;
    expect(fulfilled).toBe(COMMUNITY_QUESTIONS_PER_DAY);
    expect(rejected).toBe(3);
  });

  it("reporting uses existing moderation infrastructure", async () => {
    const list = await listPublishedQuestions({ page: 1, pageSize: 50 });
    const existing = list.items[0];
    expect(existing).toBeTruthy();
    const report = await createContentReport({
      reporterId: answerer,
      targetType: "COMMUNITY_QUESTION",
      targetId: existing!.id,
      reasonCode: "spam",
    });
    expect(report.kind === "created" || report.kind === "existing").toBe(true);
  });
  it("rejects clear violations and holds ambiguous content without leaking drafts", async () => {
    const bad = await createQuestionDraft({
      authorId: asker,
      title: "Tehdit denemesi",
      body: "Seni öldüreceğim diye yazıyorum.",
    });
    const rejected = await submitQuestion({
      authorId: asker,
      questionId: bad.id,
      idempotencyKey: `bad-${suffix}`,
    });
    expect(rejected.status).toBe("REJECTED");
    expect(await getPublicQuestion(bad.id)).toBeNull();

    const hold = await createQuestionDraft({
      authorId: asker,
      title: "Belirsiz",
      body: "Seni mahvedeceğim ifadesi belirsiz.",
    });
    const held = await submitQuestion({
      authorId: asker,
      questionId: hold.id,
      idempotencyKey: `hold-${suffix}`,
    });
    expect(held.status).toBe("PENDING_REVIEW");
    expect(await getPublicQuestion(hold.id)).toBeNull();
  });

  it("speaker invitation: expiry, revoke, wrong account, reuse, concurrent once", async () => {
    const created = await createSpeakerInvitation({
      adminId: admin,
      recipientEmail: `m32exp-${suffix}@example.com`,
      purpose: "SPEAKER_STATUS",
    });
    const token = created.plaintextToken;

    await expect(
      acceptSpeakerInvitation({ userId: asker, token }),
    ).rejects.toMatchObject({ code: "WRONG_ACCOUNT" });

    // Expert email matches but must be verified — already verified in setup.
    const first = await acceptSpeakerInvitation({ userId: expert, token });
    expect(first.alreadyAccepted).toBe(false);

    const second = await acceptSpeakerInvitation({ userId: expert, token });
    expect(second.alreadyAccepted).toBe(true);

    await expect(
      acceptSpeakerInvitation({ userId: asker, token }),
    ).rejects.toMatchObject({ code: "TOKEN_USED" });

    const profile = await db.profile.findUniqueOrThrow({ where: { userId: expert } });
    expect(profile.speakerParticipation).toBe(true);
    const expertUser = await db.user.findUniqueOrThrow({ where: { id: expert } });
    expect(expertUser.staffRole).toBe("MEMBER");

    // Concurrent accept on fresh invite
    const created2 = await createSpeakerInvitation({
      adminId: admin,
      purpose: "SPEAKER_STATUS",
    });
    const results = await Promise.allSettled([
      acceptSpeakerInvitation({ userId: answerer, token: created2.plaintextToken }),
      acceptSpeakerInvitation({ userId: answerer, token: created2.plaintextToken }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok.length).toBe(2);
    const newly = ok.filter(
      (r) => r.status === "fulfilled" && r.value.alreadyAccepted === false,
    );
    expect(newly.length).toBe(1);

    // Revoke
    const created3 = await createSpeakerInvitation({
      adminId: admin,
      purpose: "SPEAKER_STATUS",
    });
    await revokeSpeakerInvitation({ adminId: admin, invitationId: created3.invitation.id });
    await expect(
      acceptSpeakerInvitation({ userId: asker, token: created3.plaintextToken }),
    ).rejects.toMatchObject({ code: "TOKEN_REVOKED" });

    // Expired
    const created4 = await createSpeakerInvitation({
      adminId: admin,
      purpose: "SPEAKER_STATUS",
      ttlHours: 0,
    });
    await db.speakerInvitation.update({
      where: { id: created4.invitation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      acceptSpeakerInvitation({ userId: asker, token: created4.plaintextToken }),
    ).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });

    // Unauthorized cannot create
    await expect(
      createSpeakerInvitation({
        adminId: moderator,
        purpose: "SPEAKER_STATUS",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("email verification is required for email-bound invites and is not client-claimed", async () => {
    const user = await createUser("m32verify", { verified: false });
    ids.push(user.id);
    await createDefaultProfileForUser(user);

    const req = await requestEmailVerification(user.id);
    expect(req.alreadyVerified).toBe(false);
    if (req.alreadyVerified) throw new Error("unexpected");

    const invite = await createSpeakerInvitation({
      adminId: admin,
      recipientEmail: user.email,
      purpose: "SPEAKER_STATUS",
    });
    await expect(
      acceptSpeakerInvitation({ userId: user.id, token: invite.plaintextToken }),
    ).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

    await confirmEmailVerification({
      userId: user.id,
      token: req.plaintextTokenForOwner,
    });
    const accepted = await acceptSpeakerInvitation({
      userId: user.id,
      token: invite.plaintextToken,
    });
    expect(accepted.alreadyAccepted).toBe(false);

    // Token hash stored, not plaintext searchable as equal to token
    const stored = await db.emailVerificationToken.findFirst({
      where: { userId: user.id },
    });
    expect(stored?.tokenHash).toBe(hashOpaqueToken(req.plaintextTokenForOwner));
    expect(stored?.tokenHash).not.toBe(req.plaintextTokenForOwner);
  });

  it("FAQ requires expert approval of exact revision; edit invalidates approval", async () => {
    const faq = await createExpertFaqDraft({
      expertUserId: expert,
      question: "Test SSS?",
      answer: "Test yanıt.",
    });
    expect(await listPublishedFaqsForExpert(expert)).toHaveLength(0);

    const adminDraft = await createExpertFaqDraft({
      expertUserId: expert,
      question: "Admin önerisi?",
      answer: "Uzman onayı şart.",
      proposedByAdminId: admin,
    });
    expect(adminDraft.status).toBe("PENDING_EXPERT_APPROVAL");
    expect(await listPublishedFaqsForExpert(expert)).toHaveLength(0);

    const published = await expertApproveFaqRevision({
      expertUserId: expert,
      faqId: faq.id,
      revision: faq.currentRevision,
    });
    expect(published.status).toBe("PUBLISHED");
    expect((await listPublishedFaqsForExpert(expert)).length).toBeGreaterThanOrEqual(1);

    const edited = await editExpertFaq({
      actorId: expert,
      faqId: faq.id,
      question: "Değişen soru?",
      answer: "Değişen yanıt.",
    });
    expect(edited.expertApprovedRevision).toBeNull();
    expect(edited.status).toBe("DRAFT");
    expect(
      (await listPublishedFaqsForExpert(expert)).find((f) => f.id === faq.id),
    ).toBeUndefined();

    await expect(
      expertApproveFaqRevision({
        expertUserId: expert,
        faqId: faq.id,
        revision: faq.currentRevision,
      }),
    ).rejects.toMatchObject({ code: "REVISION_MISMATCH" });

    await expertApproveFaqRevision({
      expertUserId: expert,
      faqId: faq.id,
      revision: edited.currentRevision,
    });
  });

  it("draft episodes and unconfirmed appearances stay private", async () => {
    const draftEp = await createPodcastEpisode({
      adminId: admin,
      series: "PodTest",
      title: `Taslak ${suffix}`,
      publicationState: "DRAFT",
    });
    const pubEp = await createPodcastEpisode({
      adminId: admin,
      series: "PodTest",
      title: `Yayın ${suffix}`,
      listeningUrl: "https://example.com/listen",
      publicationState: "PUBLISHED",
      publicationDate: new Date(),
    });

    const published = await listPublishedEpisodes();
    expect(published.items.find((e) => e.id === draftEp.id)).toBeUndefined();
    expect(published.items.find((e) => e.id === pubEp.id)).toBeTruthy();

    const appearance = await requestAppearance({
      memberUserId: expert,
      episodeId: pubEp.id,
    });
    expect(appearance.status).toBe("PENDING_ADMIN");
    expect(await listPublicAppearancesForMember(expert)).toHaveLength(0);

    // Member cannot self-verify via admin path
    await expect(
      adminVerifyAppearance({ adminId: expert, appearanceId: appearance.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await adminVerifyAppearance({ adminId: admin, appearanceId: appearance.id });

    // Still hidden until profile is published (and showAppearancesOnProfile)
    expect(await listPublicAppearancesForMember(expert)).toHaveLength(0);

    await db.profile.update({
      where: { userId: expert },
      data: {
        published: true,
        publicationStatus: "APPROVED",
        publicSnapshot: {
          displayName: "Expert",
          slug: `exp-${suffix}`,
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
        showAppearancesOnProfile: true,
      },
    });
    const publicApps = await listPublicAppearancesForMember(expert);
    expect(publicApps.some((a) => a.episode.id === pubEp.id)).toBe(true);
  });
});
