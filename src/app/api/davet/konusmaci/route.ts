import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  acceptSpeakerInvitation,
  createSpeakerInvitation,
  listSpeakerInvitations,
  revokeSpeakerInvitation,
} from "@/lib/community/invitations";
import type { SpeakerInvitationPurpose } from "@/generated/prisma/client";

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  const status = code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 400;
  return NextResponse.json({ error: code }, { status });
}

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const invitations = await listSpeakerInvitations(session.user.id);
    return NextResponse.json({ invitations });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    recipientEmail?: string;
    purpose?: SpeakerInvitationPurpose;
    episodeId?: string;
    note?: string;
    invitationId?: string;
    token?: string;
  };

  try {
    if (body.action === "create") {
      const result = await createSpeakerInvitation({
        adminId: session.user.id,
        recipientEmail: body.recipientEmail,
        purpose: body.purpose ?? "SPEAKER_STATUS",
        episodeId: body.episodeId,
        note: body.note,
      });
      return NextResponse.json(result);
    }
    if (body.action === "revoke" && body.invitationId) {
      const invitation = await revokeSpeakerInvitation({
        adminId: session.user.id,
        invitationId: body.invitationId,
      });
      return NextResponse.json({ invitation });
    }
    if (body.action === "accept" && body.token) {
      const result = await acceptSpeakerInvitation({
        userId: session.user.id,
        token: body.token,
      });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
