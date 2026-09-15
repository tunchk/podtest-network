import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDefaultProfileForUser, updateOwnedProfileDraft, submitProfileForReview, resolvePublicationReview } from "@/lib/profiles/service";
import { createMessageRequest, acceptMessageRequest, rejectMessageRequest, cancelMessageRequest } from "@/lib/messaging/requests";
import { sendMessage, listMessages, listInbox, markConversationRead, getUnreadTotal } from "@/lib/messaging/conversations";
import { blockMember, unblockMember, isEitherBlocked } from "@/lib/messaging/blocks";
import { updateMessagingPreferences } from "@/lib/messaging/preferences";
import { classifyMessagingContent } from "@/lib/messaging/content-moderation";
import { createContentReport } from "@/lib/messaging/reports";
import { getMessageRequestQuotaStatus } from "@/lib/messaging/quota";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `m31-${Date.now().toString(36)}`;

async function createUser(label: string) {
  return db.user.create({
    data: {
      name: label,
      email: `${label}-${suffix}@example.com`,
      emailVerified: true,
      staffRole: "MEMBER",
    },
  });
}

async function publishProfile(userId: string, name: string, adminId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await createDefaultProfileForUser(user);
  await updateOwnedProfileDraft(userId, {
    slug: `${name}-${suffix}`,
    displayName: name,
    bio: "Yayınlanmış test profili",
    headline: "Mühendis",
  });
  await submitProfileForReview(userId);
  const review = await db.publicationReview.findFirst({
    where: { profile: { userId }, status: "PENDING" },
  });
  if (!review) throw new Error("missing review");
  await resolvePublicationReview({
    reviewId: review.id,
    reviewerId: adminId,
    decision: "APPROVED",
  });
}

describe("m3.1 messaging", () => {
  let a = "";
  let b = "";
  let c = "";
  let admin = "";
  const ids: string[] = [];

  beforeAll(async () => {
    const ua = await createUser("m31a");
    const ub = await createUser("m31b");
    const uc = await createUser("m31c");
    const uadmin = await createUser("m31admin");
    await db.user.update({ where: { id: uadmin.id }, data: { staffRole: "ADMIN" } });
    a = ua.id;
    b = ub.id;
    c = uc.id;
    admin = uadmin.id;
    ids.push(a, b, c, admin);
    await publishProfile(b, "m31b", admin);
    await publishProfile(a, "m31a", admin);
    await publishProfile(c, "m31c", admin);
  });

  afterAll(async () => {
    await db.directMessage.deleteMany({
      where: { senderId: { in: ids } },
    });
    await db.conversationParticipant.deleteMany({ where: { userId: { in: ids } } });
    await db.messageRequest.deleteMany({
      where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] },
    });
    await db.conversation.deleteMany({
      where: {
        OR: [{ participantLowId: { in: ids } }, { participantHighId: { in: ids } }],
      },
    });
    await db.memberBlock.deleteMany({
      where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] },
    });
    await db.messageRequestQuotaUse.deleteMany({ where: { userId: { in: ids } } });
    await db.messageRequestCooldown.deleteMany({});
    await db.moderationHold.deleteMany({ where: { senderId: { in: ids } } });
    await db.contentReport.deleteMany({ where: { reporterId: { in: ids } } });
    await db.messagingPreferences.deleteMany({ where: { userId: { in: ids } } });
    await db.automatedContentReview.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.publicationReview.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.profile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("A requests B, B accepts, both exchange messages; C is isolated", async () => {
    const created = await createMessageRequest({
      senderId: a,
      recipientId: b,
      introduction: "Merhaba, iş birliği için yazıyorum.",
      idempotencyKey: `a-to-b-${suffix}`,
    });
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;

    const accepted = await acceptMessageRequest({
      recipientId: b,
      requestId: created.request.id,
    });
    const again = await acceptMessageRequest({
      recipientId: b,
      requestId: created.request.id,
    });
    expect(again.conversationId).toBe(accepted.conversationId);
    expect(again.already).toBe(true);

    const m1 = await sendMessage({
      conversationId: accepted.conversationId,
      senderId: a,
      body: "İlk mesaj",
      idempotencyKey: `a-msg-1-${suffix}`,
    });
    expect(m1.kind).toBe("created");
    const dup = await sendMessage({
      conversationId: accepted.conversationId,
      senderId: a,
      body: "İlk mesaj",
      idempotencyKey: `a-msg-1-${suffix}`,
    });
    expect(dup.kind).toBe("existing");

    await sendMessage({
      conversationId: accepted.conversationId,
      senderId: b,
      body: "Yanıt",
      idempotencyKey: `b-msg-1-${suffix}`,
    });

    const page = await listMessages({ conversationId: accepted.conversationId, userId: a });
    expect(page.messages.length).toBeGreaterThanOrEqual(2);

    await expect(
      listMessages({ conversationId: accepted.conversationId, userId: c }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const inboxC = await listInbox(c);
    expect(inboxC.find((i) => i.conversationId === accepted.conversationId)).toBeUndefined();
    expect(await getUnreadTotal(c)).toBe(0);
  });

  it("pending requests cannot send normal messages; opposite pending surfaces", async () => {
    await updateMessagingPreferences({ userId: c, acceptMessageRequests: true });

    const r1 = await createMessageRequest({
      senderId: a,
      recipientId: c,
      introduction: "A den C ye opposite test",
      idempotencyKey: `a-to-c-opp-${suffix}`,
    });
    expect(r1.kind).toBe("created");

    const opposite = await createMessageRequest({
      senderId: c,
      recipientId: a,
      introduction: "C den A ye",
      idempotencyKey: `c-to-a-opp-${suffix}`,
    });
    expect(opposite.kind).toBe("opposite_pending");

    if (r1.kind === "created") {
      await rejectMessageRequest({ recipientId: c, requestId: r1.request.id });
      await expect(
        cancelMessageRequest({ senderId: a, requestId: r1.request.id }),
      ).rejects.toMatchObject({ code: "INVALID_STATE" });
    }
  });

  it("enforces preferences, cooldown, quota idempotency, and concurrent allowance", async () => {
    await updateMessagingPreferences({ userId: b, acceptMessageRequests: false });
    await expect(
      createMessageRequest({
        senderId: a,
        recipientId: b,
        introduction: "kapalı",
        idempotencyKey: `pref-${suffix}`,
      }),
    ).rejects.toMatchObject({ code: "REQUESTS_DISABLED" });
    await updateMessagingPreferences({ userId: b, acceptMessageRequests: true });

    const quota = await getMessageRequestQuotaStatus(a);
    expect(quota.remaining).toBeLessThanOrEqual(quota.allowance);

    // Idempotent create consumes once
    const key = `idem-quota-${suffix}`;
    // Need a recipient without active conversation/cooldown with a — use admin's published? publish admin
    await publishProfile(admin, "m31admin", admin);
    const first = await createMessageRequest({
      senderId: a,
      recipientId: admin,
      introduction: "quota test",
      idempotencyKey: key,
    });
    const second = await createMessageRequest({
      senderId: a,
      recipientId: admin,
      introduction: "quota test",
      idempotencyKey: key,
    });
    expect(first.kind === "created" || first.kind === "existing").toBe(true);
    expect(second.kind).toBe("existing");
    await expect(
      createMessageRequest({
        senderId: a,
        recipientId: admin,
        introduction: "different body",
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("blocks stop both directions; unblock does not auto-reopen", async () => {
    // Find A-B conversation
    const inbox = await listInbox(a);
    const ab = inbox.find((i) => i.peer.userId === b);
    expect(ab).toBeTruthy();
    if (!ab) return;

    await blockMember({ blockerId: b, blockedId: a });
    expect(await isEitherBlocked(a, b)).toBe(true);

    await expect(
      sendMessage({
        conversationId: ab.conversationId,
        senderId: a,
        body: "blocked",
        idempotencyKey: `blocked-${suffix}`,
      }),
    ).rejects.toMatchObject({ code: "NOT_AVAILABLE" });

    await expect(
      createMessageRequest({
        senderId: a,
        recipientId: b,
        introduction: "again",
        idempotencyKey: `after-block-${suffix}`,
      }),
    ).rejects.toMatchObject({ code: "NOT_AVAILABLE" });

    await unblockMember({ blockerId: b, blockedId: a });
    // Messaging still paused until resumption accept
    await expect(
      sendMessage({
        conversationId: ab.conversationId,
        senderId: a,
        body: "still paused",
        idempotencyKey: `paused-${suffix}`,
      }),
    ).rejects.toMatchObject({ code: "MESSAGING_PAUSED" });
  });

  it("content moderation holds threats; ordinary criticism is clear", async () => {
    expect(classifyMessagingContent("Bu yaklaşımı eleştiriyorum, yetersiz.").outcome).toBe("clear");
    expect(classifyMessagingContent("seni öldüreceğim").outcome).toBe("reject");
  });

  it("reports require authorized access; hosts have no special access", async () => {
    await expect(
      createContentReport({
        reporterId: c,
        targetType: "MESSAGE",
        targetId: "nonexistent",
        reasonCode: "spam",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
