import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  acceptMessageRequest,
  rejectMessageRequest,
  cancelMessageRequest,
} from "@/lib/messaging/requests";
import { blockMember } from "@/lib/messaging/blocks";

type Params = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  const code = error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  const status = code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 400;
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };

  try {
    if (body.action === "accept") {
      const result = await acceptMessageRequest({
        recipientId: session.user.id,
        requestId: id,
      });
      return NextResponse.json(result);
    }
    if (body.action === "reject") {
      const result = await rejectMessageRequest({
        recipientId: session.user.id,
        requestId: id,
      });
      return NextResponse.json({ request: result });
    }
    if (body.action === "cancel") {
      const result = await cancelMessageRequest({
        senderId: session.user.id,
        requestId: id,
      });
      return NextResponse.json({ request: result });
    }
    if (body.action === "block") {
      // Recipient or sender may block via request context after loading ownership
      const { prisma } = await import("@/lib/db");
      const req = await prisma.messageRequest.findUnique({ where: { id } });
      if (!req) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      const other =
        req.recipientId === session.user.id
          ? req.senderId
          : req.senderId === session.user.id
            ? req.recipientId
            : null;
      if (!other) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      await blockMember({ blockerId: session.user.id, blockedId: other });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
