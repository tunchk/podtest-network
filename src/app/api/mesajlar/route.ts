import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getMessageRequestQuotaStatus,
  createMessageRequest,
  listIncomingRequests,
  listOutgoingRequests,
  publicIdentityFromUser,
} from "@/lib/messaging/requests";
import { getMessagingPreferences, updateMessagingPreferences } from "@/lib/messaging/preferences";
import { getUnreadTotal } from "@/lib/messaging/conversations";

function errorResponse(error: unknown) {
  const code = error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  const status =
    code === "QUOTA_EXCEEDED" || code === "CAPABILITY_DENIED"
      ? 402
      : code === "FORBIDDEN"
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

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [prefs, quota, incoming, outgoing, unreadTotal] = await Promise.all([
    getMessagingPreferences(session.user.id),
    getMessageRequestQuotaStatus(session.user.id),
    listIncomingRequests(session.user.id),
    listOutgoingRequests(session.user.id),
    getUnreadTotal(session.user.id),
  ]);

  return NextResponse.json({
    preferences: {
      acceptMessageRequests: prefs.acceptMessageRequests,
      messagingRestrictedUntil: prefs.messagingRestrictedUntil,
    },
    quota: {
      remaining: quota.remaining,
      allowance: quota.allowance,
      used: quota.used,
      resetAt: quota.resetAt,
      yearMonth: quota.yearMonth,
    },
    unreadTotal,
    incoming: incoming.map((r) => ({
      id: r.id,
      introduction: r.introduction,
      createdAt: r.createdAt,
      isResumption: r.isResumption,
      sender: publicIdentityFromUser(r.sender),
    })),
    outgoing: outgoing.map((r) => ({
      id: r.id,
      status: r.status,
      introduction: r.introduction,
      createdAt: r.createdAt,
      recipient: publicIdentityFromUser(r.recipient),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    acceptMessageRequests?: boolean;
    recipientId?: string;
    introduction?: string;
    idempotencyKey?: string;
    isResumption?: boolean;
  };

  try {
    if (body.action === "update_preferences") {
      const prefs = await updateMessagingPreferences({
        userId: session.user.id,
        acceptMessageRequests: Boolean(body.acceptMessageRequests),
      });
      return NextResponse.json({
        preferences: { acceptMessageRequests: prefs.acceptMessageRequests },
      });
    }

    if (body.action === "create_request") {
      if (!body.recipientId || !body.introduction || !body.idempotencyKey) {
        return NextResponse.json({ error: "invalid" }, { status: 400 });
      }
      const result = await createMessageRequest({
        senderId: session.user.id,
        recipientId: body.recipientId,
        introduction: body.introduction,
        idempotencyKey: body.idempotencyKey,
        isResumption: body.isResumption,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
