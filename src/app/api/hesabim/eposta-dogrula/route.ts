import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  confirmEmailVerification,
  requestEmailVerification,
} from "@/lib/auth/email-verification";

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  return NextResponse.json({ error: code }, { status: 400 });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    token?: string;
  };

  try {
    if (body.action === "request" || !body.action) {
      const result = await requestEmailVerification(session.user.id);
      // Owner-only plaintext for local sink UX; never log.
      return NextResponse.json({
        alreadyVerified: result.alreadyVerified,
        ...(result.alreadyVerified
          ? {}
          : {
              expiresAt: result.expiresAt,
              sinkFile: result.sinkFile,
              verifyPath: `/hesabim/eposta-dogrula?token=${result.plaintextTokenForOwner}`,
            }),
      });
    }
    if (body.action === "confirm" && body.token) {
      const result = await confirmEmailVerification({
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
