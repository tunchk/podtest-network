import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  listMessages,
  sendMessage,
  markConversationRead,
  assertConversationMember,
} from "@/lib/messaging/conversations";
import { blockMember, unblockMember } from "@/lib/messaging/blocks";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ conversationId: string }> };

function errorResponse(error: unknown) {
  const code = error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  const status =
    code === "FORBIDDEN"
      ? 403
      : code === "NOT_FOUND"
        ? 404
        : code === "IDEMPOTENCY_CONFLICT"
          ? 409
          : code === "RATE_LIMITED"
            ? 429
            : 400;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { conversationId } = await params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");

  try {
    await assertConversationMember(conversationId, session.user.id);
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    const page = await listMessages({
      conversationId,
      userId: session.user.id,
      cursor,
    });
    const otherId =
      conversation.participantLowId === session.user.id
        ? conversation.participantHighId
        : conversation.participantLowId;
    const other = await prisma.user.findUnique({
      where: { id: otherId },
      select: {
        id: true,
        name: true,
        profile: {
          select: {
            displayName: true,
            slug: true,
            published: true,
            publicationStatus: true,
          },
        },
      },
    });

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        messagingState: conversation.messagingState,
      },
      peer: other
        ? {
            userId: other.id,
            displayName: other.profile?.displayName || other.name,
            slug:
              other.profile?.published && other.profile.publicationStatus === "APPROVED"
                ? other.profile.slug
                : null,
          }
        : null,
      ...page,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { conversationId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    text?: string;
    idempotencyKey?: string;
    messageId?: string;
  };

  try {
    if (body.action === "send") {
      const result = await sendMessage({
        conversationId,
        senderId: session.user.id,
        body: body.text ?? "",
        idempotencyKey: body.idempotencyKey ?? "",
      });
      return NextResponse.json(result);
    }
    if (body.action === "read" && body.messageId) {
      await markConversationRead({
        conversationId,
        userId: session.user.id,
        messageId: body.messageId,
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "block") {
      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      await assertConversationMember(conversationId, session.user.id);
      const otherId =
        conversation.participantLowId === session.user.id
          ? conversation.participantHighId
          : conversation.participantLowId;
      await blockMember({ blockerId: session.user.id, blockedId: otherId });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "unblock") {
      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      await assertConversationMember(conversationId, session.user.id);
      const otherId =
        conversation.participantLowId === session.user.id
          ? conversation.participantHighId
          : conversation.participantLowId;
      await unblockMember({ blockerId: session.user.id, blockedId: otherId });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
